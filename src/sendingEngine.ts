import { BrowserWindow } from 'electron';
import { Campaign, MessageQueueItem, MessageVariation } from './types';
import { WhatsAppSender } from './whatsappSender';
import { Logger } from './logger';
import { LoggerService } from './loggerService';
import { CampaignManager } from './campaignManager';

export class SendingEngine {
  private campaignManager: CampaignManager;
  private logger: Logger;
  private enhancedLogger: LoggerService;
  private activeCampaigns: Map<string, boolean> = new Map();
  private pausedCampaigns: Set<string> = new Set();
  private messageQueues: Map<string, MessageQueueItem[]> = new Map();
  private deviceLocks: Map<string, Promise<void>> = new Map();

  constructor(campaignManager: CampaignManager, logger: Logger, enhancedLogger: LoggerService) {
    this.campaignManager = campaignManager;
    this.logger = logger;
    this.enhancedLogger = enhancedLogger;
    this.enhancedLogger.info('SendingEngine initialized', { component: 'SendingEngine' });
  }

  private async withDeviceLock<T>(
    deviceId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    while (this.deviceLocks.has(deviceId)) {
      await this.deviceLocks.get(deviceId);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    let releaseLock: () => void;
    const lockPromise = new Promise<void>(resolve => {
      releaseLock = resolve;
    });
    this.deviceLocks.set(deviceId, lockPromise);

    try {
      return await operation();
    } finally {
      this.deviceLocks.delete(deviceId);
      releaseLock!();
    }
  }

  async startCampaign(
    campaignId: string,
    deviceWindows: Map<string, BrowserWindow>
  ): Promise<void> {
    const campaign = this.campaignManager.getCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    if (this.activeCampaigns.get(campaignId)) {
      throw new Error(`Campaign ${campaignId} is already running`);
    }

    this.activeCampaigns.set(campaignId, true);
    this.campaignManager.updateCampaignStatus(campaignId, 'RUNNING');
    this.logger.info(`Campaign "${campaign.name}" started`, { campaignId });

    const queue = this.createMessageQueue(campaign, deviceWindows);
    this.messageQueues.set(campaignId, queue);

    this.processCampaignQueue(campaignId, deviceWindows);
  }

  pauseCampaign(campaignId: string): void {
    this.pausedCampaigns.add(campaignId);
    this.campaignManager.updateCampaignStatus(campaignId, 'PAUSED');
    this.logger.info(`Campaign paused`, { campaignId });
  }

  resumeCampaign(campaignId: string, deviceWindows: Map<string, BrowserWindow>): void {
    this.pausedCampaigns.delete(campaignId);
    this.campaignManager.updateCampaignStatus(campaignId, 'RUNNING');
    this.logger.info(`Campaign resumed`, { campaignId });

    if (!this.activeCampaigns.get(campaignId)) {
      this.activeCampaigns.set(campaignId, true);
      this.processCampaignQueue(campaignId, deviceWindows);
    }
  }

  stopCampaign(campaignId: string): void {
    this.activeCampaigns.set(campaignId, false);
    this.pausedCampaigns.delete(campaignId);
    this.messageQueues.delete(campaignId);
    this.campaignManager.updateCampaignStatus(campaignId, 'STOPPED');
    this.logger.info(`Campaign stopped`, { campaignId });
    this.enhancedLogger.info('Campaign queue cleaned up', {
      component: 'SendingEngine',
      campaignId
    });
  }

  private createMessageQueue(
    campaign: Campaign,
    deviceWindows: Map<string, BrowserWindow>
  ): MessageQueueItem[] {
    const queue: MessageQueueItem[] = [];
    const devices = Array.from(deviceWindows.keys()).filter(id =>
      campaign.selectedDevices.includes(id)
    );

    if (devices.length === 0) {
      throw new Error('No valid devices selected for campaign');
    }

    campaign.contacts.forEach((contact, index) => {
      const deviceId = devices[index % devices.length];
      const personalizedMessage = this.personalizeMessage(campaign.message, campaign.variations);
      const fullNumber = campaign.countryCode + contact;

      queue.push({
        id: `msg-${Date.now()}-${index}`,
        campaignId: campaign.id,
        contact: fullNumber,
        message: personalizedMessage,
        deviceId,
        status: 'PENDING',
        attempts: 0,
      });
    });

    return queue;
  }

  private personalizeMessage(template: string, variations: MessageVariation[]): string {
    let message = template;

    variations.forEach(variation => {
      const { placeholder, variations: varList } = variation;
      if (varList.length > 0) {
        const randomVariation = varList[Math.floor(Math.random() * varList.length)];
        message = message.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), randomVariation);
      }
    });

    return message;
  }

  private async processCampaignQueue(
    campaignId: string,
    deviceWindows: Map<string, BrowserWindow>
  ): Promise<void> {
    const campaign = this.campaignManager.getCampaign(campaignId);
    if (!campaign) return;

    const queue = this.messageQueues.get(campaignId);
    if (!queue) return;

    while (this.activeCampaigns.get(campaignId)) {
      if (this.pausedCampaigns.has(campaignId)) {
        await this.delay(1000);
        continue;
      }

      const pendingItems = queue.filter(
        item => item.status === 'PENDING' || (item.status === 'FAILED' && item.attempts < 3)
      );

      if (pendingItems.length === 0) {
        this.completeCampaign(campaignId);
        break;
      }

      const item = pendingItems[0];
      const deviceWindow = deviceWindows.get(item.deviceId);

      if (!deviceWindow || deviceWindow.isDestroyed()) {
        this.logger.error(`Device ${item.deviceId} not available`, {
          campaignId,
          deviceId: item.deviceId,
        });
        item.status = 'FAILED';
        item.error = 'Device not available';
        this.updateCampaignStats(campaignId, queue);
        continue;
      }

      await this.withDeviceLock(item.deviceId, async () => {
        await this.sendMessage(item, deviceWindow, campaignId);
      });
      this.updateCampaignStats(campaignId, queue);

      const delay = this.getRandomDelay(campaign.minDelay, campaign.maxDelay);
      this.logger.info(`Waiting ${delay}ms before next message`, { campaignId });
      await this.delay(delay);
    }
  }

  private async sendMessage(
    item: MessageQueueItem,
    deviceWindow: BrowserWindow,
    campaignId: string
  ): Promise<void> {
    item.status = 'SENDING';
    item.attempts++;
    item.lastAttempt = Date.now();

    this.logger.info(`Sending to ${item.contact} via device ${item.deviceId}`, {
      campaignId,
      deviceId: item.deviceId,
      contact: item.contact,
    });

    try {
      const sender = new WhatsAppSender(deviceWindow);
      await sender.sendMessage(item.contact, item.message);

      item.status = 'SENT';
      this.logger.success(`Message sent successfully to ${item.contact}`, {
        campaignId,
        deviceId: item.deviceId,
        contact: item.contact,
      });
    } catch (error: any) {
      if (error.message === 'NUMBER_NOT_ON_WHATSAPP') {
        item.status = 'FAILED';
        item.error = 'Number not on WhatsApp';
        this.logger.warning(`${item.contact} is not on WhatsApp`, {
          campaignId,
          contact: item.contact,
        });
      } else if (item.attempts >= 3) {
        item.status = 'FAILED';
        item.error = error.message;
        this.logger.error(`Failed to send to ${item.contact} after 3 attempts: ${error.message}`, {
          campaignId,
          deviceId: item.deviceId,
          contact: item.contact,
        });
      } else {
        item.status = 'PENDING';
        this.logger.warning(`Retry ${item.attempts}/3 for ${item.contact}: ${error.message}`, {
          campaignId,
          deviceId: item.deviceId,
          contact: item.contact,
        });
      }
    }
  }

  private updateCampaignStats(campaignId: string, queue: MessageQueueItem[]): void {
    const sent = queue.filter(item => item.status === 'SENT').length;
    const failed = queue.filter(item => item.status === 'FAILED').length;
    const pending = queue.filter(
      item => item.status === 'PENDING' || item.status === 'SENDING'
    ).length;
    const total = queue.length;

    this.campaignManager.updateCampaignStats(campaignId, {
      total,
      sent,
      failed,
      pending,
    });
  }

  private completeCampaign(campaignId: string): void {
    this.activeCampaigns.set(campaignId, false);
    this.messageQueues.delete(campaignId);
    this.campaignManager.updateCampaignStatus(campaignId, 'COMPLETED');
    this.logger.success(`Campaign completed`, { campaignId });

    const campaign = this.campaignManager.getCampaign(campaignId);
    if (campaign) {
      this.logger.info(
        `Final stats: ${campaign.stats.sent} sent, ${campaign.stats.failed} failed`,
        { campaignId }
      );
    }

    this.enhancedLogger.success('Campaign queue cleaned up', {
      component: 'SendingEngine',
      campaignId
    });
  }

  private getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  isCampaignActive(campaignId: string): boolean {
    return this.activeCampaigns.get(campaignId) === true;
  }

  isCampaignPaused(campaignId: string): boolean {
    return this.pausedCampaigns.has(campaignId);
  }
}
