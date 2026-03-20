import { BrowserWindow } from 'electron';
import { Campaign, MessageQueueItem, MessageVariation } from './types';
import { WhatsAppSender, ErrorType } from './whatsappSender';
import { Logger } from './logger';
import { LoggerService } from './loggerService';
import { CampaignManager } from './campaignManager';
import { QueueStorage } from './queueStorage';

interface DeviceLock {
  promise: Promise<void>;
  acquiredAt: number;
  deviceId: string;
}

interface DeviceHealth {
  deviceId: string;
  consecutiveFailures: number;
  lastFailure?: number;
  isPaused: boolean;
  pausedUntil?: number;
  totalSent: number;
  totalFailed: number;
}

export class SendingEngine {
  private campaignManager: CampaignManager;
  private logger: Logger;
  private enhancedLogger: LoggerService;
  private queueStorage: QueueStorage;
  private activeCampaigns: Map<string, boolean> = new Map();
  private pausedCampaigns: Set<string> = new Set();
  private messageQueues: Map<string, MessageQueueItem[]> = new Map();
  private deviceLocks: Map<string, DeviceLock> = new Map();
  private deviceHealth: Map<string, DeviceHealth> = new Map();
  private statsBatchCounter: Map<string, number> = new Map();
  private lockTimeoutMs = 60000;
  private lockAcquireTimeoutMs = 30000;

  constructor(
    campaignManager: CampaignManager,
    logger: Logger,
    enhancedLogger: LoggerService,
    queueStorage: QueueStorage
  ) {
    this.campaignManager = campaignManager;
    this.logger = logger;
    this.enhancedLogger = enhancedLogger;
    this.queueStorage = queueStorage;
    this.enhancedLogger.info('SendingEngine initialized', { component: 'SendingEngine' });
    this.startLockMonitoring();
  }

  private startLockMonitoring(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [deviceId, lock] of this.deviceLocks.entries()) {
        const lockAge = now - lock.acquiredAt;
        if (lockAge > this.lockTimeoutMs) {
          this.enhancedLogger.warning('Force releasing stuck lock', {
            component: 'SendingEngine',
            deviceId,
            lockAge
          });
          this.deviceLocks.delete(deviceId);
        }
      }
    }, 5000);
  }

  private async withDeviceLock<T>(
    deviceId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const startWait = Date.now();

    while (this.deviceLocks.has(deviceId)) {
      if (Date.now() - startWait > this.lockAcquireTimeoutMs) {
        throw new Error(`Lock acquisition timeout for device ${deviceId}`);
      }
      await this.delay(100);
    }

    let releaseLock: () => void;
    const lockPromise = new Promise<void>(resolve => {
      releaseLock = resolve;
    });

    const lock: DeviceLock = {
      promise: lockPromise,
      acquiredAt: Date.now(),
      deviceId
    };

    this.deviceLocks.set(deviceId, lock);

    try {
      return await operation();
    } finally {
      this.deviceLocks.delete(deviceId);
      releaseLock!();
    }
  }

  private initializeDeviceHealth(deviceId: string): void {
    if (!this.deviceHealth.has(deviceId)) {
      this.deviceHealth.set(deviceId, {
        deviceId,
        consecutiveFailures: 0,
        isPaused: false,
        totalSent: 0,
        totalFailed: 0
      });
    }
  }

  private isDeviceHealthy(deviceId: string): boolean {
    const health = this.deviceHealth.get(deviceId);
    if (!health) return true;

    if (health.isPaused && health.pausedUntil) {
      if (Date.now() < health.pausedUntil) {
        return false;
      } else {
        health.isPaused = false;
        health.pausedUntil = undefined;
        health.consecutiveFailures = 0;
        this.enhancedLogger.info('Device auto-resumed after pause', {
          component: 'SendingEngine',
          deviceId
        });
      }
    }

    return !health.isPaused && health.consecutiveFailures < 5;
  }

  private recordDeviceSuccess(deviceId: string): void {
    const health = this.deviceHealth.get(deviceId);
    if (health) {
      health.consecutiveFailures = 0;
      health.totalSent++;
    }
  }

  private recordDeviceFailure(deviceId: string, errorType: ErrorType): void {
    this.initializeDeviceHealth(deviceId);
    const health = this.deviceHealth.get(deviceId)!;

    health.consecutiveFailures++;
    health.totalFailed++;
    health.lastFailure = Date.now();

    if (errorType === 'RATE_LIMIT') {
      health.isPaused = true;
      health.pausedUntil = Date.now() + 5 * 60 * 1000;
      this.enhancedLogger.warning('Device paused due to rate limit', {
        component: 'SendingEngine',
        deviceId,
        pausedUntil: new Date(health.pausedUntil).toISOString()
      });
    } else if (health.consecutiveFailures >= 5) {
      health.isPaused = true;
      this.enhancedLogger.error('Device paused after 5 consecutive failures', {
        component: 'SendingEngine',
        deviceId,
        consecutiveFailures: health.consecutiveFailures
      });
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

    deviceWindows.forEach((_, deviceId) => {
      this.initializeDeviceHealth(deviceId);
    });

    this.activeCampaigns.set(campaignId, true);
    this.campaignManager.updateCampaignStatus(campaignId, 'RUNNING');
    this.logger.info(`Campaign "${campaign.name}" started`, { campaignId });

    const existingQueue = this.queueStorage.loadQueue(campaignId);
    let queue: MessageQueueItem[];

    if (existingQueue && existingQueue.length > 0) {
      queue = existingQueue;
      this.enhancedLogger.info('Resuming campaign from saved queue', {
        component: 'SendingEngine',
        campaignId,
        queueSize: queue.length
      });
    } else {
      queue = this.createMessageQueue(campaign, deviceWindows);
      this.queueStorage.saveQueue(campaignId, queue);
    }

    this.messageQueues.set(campaignId, queue);
    this.statsBatchCounter.set(campaignId, 0);

    this.processCampaignQueue(campaignId, deviceWindows);
  }

  async resumeInterruptedCampaigns(deviceWindows: Map<string, BrowserWindow>): Promise<void> {
    const campaigns = this.campaignManager.getAllCampaigns();
    const interruptedCampaigns = campaigns.filter(
      (c: Campaign) => c.status === 'RUNNING' || c.status === 'PAUSED'
    );

    for (const campaign of interruptedCampaigns) {
      try {
        this.enhancedLogger.info('Auto-resuming interrupted campaign', {
          component: 'SendingEngine',
          campaignId: campaign.id,
          status: campaign.status
        });

        if (campaign.status === 'RUNNING') {
          await this.startCampaign(campaign.id, deviceWindows);
        }
      } catch (error) {
        this.enhancedLogger.error('Failed to auto-resume campaign', {
          component: 'SendingEngine',
          campaignId: campaign.id,
          error: String(error)
        });
      }
    }
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
    this.statsBatchCounter.delete(campaignId);
    this.queueStorage.deleteQueue(campaignId);

    for (const [deviceId] of this.deviceLocks.entries()) {
      this.deviceLocks.delete(deviceId);
    }

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

    let messagesSinceCheckpoint = 0;

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

      const healthyDevices = Array.from(deviceWindows.keys()).filter(deviceId =>
        this.isDeviceHealthy(deviceId) && deviceWindows.get(deviceId) && !deviceWindows.get(deviceId)!.isDestroyed()
      );

      if (healthyDevices.length === 0) {
        this.enhancedLogger.warning('No healthy devices available, waiting...', {
          component: 'SendingEngine',
          campaignId
        });
        await this.delay(5000);
        continue;
      }

      let item = pendingItems.find(i => healthyDevices.includes(i.deviceId));

      if (!item) {
        item = pendingItems[0];
        const newDeviceId = healthyDevices[Math.floor(Math.random() * healthyDevices.length)];
        this.enhancedLogger.info('Redistributing message to healthy device', {
          component: 'SendingEngine',
          campaignId,
          oldDevice: item.deviceId,
          newDevice: newDeviceId
        });
        item.deviceId = newDeviceId;
      }

      const deviceWindow = deviceWindows.get(item.deviceId);

      if (!deviceWindow || deviceWindow.isDestroyed()) {
        this.logger.error(`Device ${item.deviceId} not available`, {
          campaignId,
          deviceId: item.deviceId,
        });
        continue;
      }

      try {
        await this.withDeviceLock(item.deviceId, async () => {
          await this.sendMessage(item, deviceWindow, campaignId);
        });

        messagesSinceCheckpoint++;
        if (messagesSinceCheckpoint >= 10) {
          this.queueStorage.saveCheckpoint(campaignId, queue);
          messagesSinceCheckpoint = 0;
        }
      } catch (error) {
        this.enhancedLogger.error('Lock acquisition failed', {
          component: 'SendingEngine',
          campaignId,
          deviceId: item.deviceId,
          error: String(error)
        });
      }

      this.updateCampaignStatsBatched(campaignId, queue);
      this.queueStorage.saveQueue(campaignId, queue);

      const delay = this.getRandomDelay(campaign.minDelay, campaign.maxDelay);
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

      const isOnline = await sender.checkNetworkConnectivity();
      if (!isOnline) {
        throw { type: 'NETWORK', retryable: true, message: 'Network connectivity lost' };
      }

      const isRateLimited = await sender.detectRateLimit();
      if (isRateLimited) {
        throw { type: 'RATE_LIMIT', retryable: true, retryAfter: 300000, message: 'Rate limit detected' };
      }

      await sender.sendMessage(item.contact, item.message);

      item.status = 'SENT';
      this.recordDeviceSuccess(item.deviceId);
      this.logger.success(`Message sent successfully to ${item.contact}`, {
        campaignId,
        deviceId: item.deviceId,
        contact: item.contact,
      });
    } catch (error: any) {
      const errorType: ErrorType = error.type || 'UNKNOWN';
      const retryable = error.retryable !== false;

      this.recordDeviceFailure(item.deviceId, errorType);

      if (errorType === 'PERMANENT' || error.message === 'NUMBER_NOT_ON_WHATSAPP') {
        item.status = 'FAILED';
        item.error = 'Number not on WhatsApp';
        this.logger.warning(`${item.contact} is not on WhatsApp`, {
          campaignId,
          contact: item.contact,
        });
      } else if (errorType === 'RATE_LIMIT') {
        item.status = 'PENDING';
        item.error = 'Rate limited';
        this.logger.warning(`Device rate limited, message will be retried`, {
          campaignId,
          deviceId: item.deviceId,
          contact: item.contact,
        });
      } else if (errorType === 'NETWORK') {
        item.status = 'PENDING';
        item.error = 'Network error';
        this.logger.warning(`Network error, will retry`, {
          campaignId,
          deviceId: item.deviceId,
          contact: item.contact,
        });
        await this.delay(5000);
      } else if (item.attempts >= 3) {
        item.status = 'FAILED';
        item.error = error.message || 'Unknown error';
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

        const retryDelay = this.getExponentialBackoffDelay(item.attempts);
        await this.delay(retryDelay);
      }
    }
  }

  private getExponentialBackoffDelay(attempt: number): number {
    const delays = [5000, 15000, 45000];
    return delays[Math.min(attempt - 1, delays.length - 1)];
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

  private updateCampaignStatsBatched(campaignId: string, queue: MessageQueueItem[]): void {
    const counter = this.statsBatchCounter.get(campaignId) || 0;
    this.statsBatchCounter.set(campaignId, counter + 1);

    if (counter >= 10) {
      this.updateCampaignStats(campaignId, queue);
      this.statsBatchCounter.set(campaignId, 0);
    }
  }

  private completeCampaign(campaignId: string): void {
    const queue = this.messageQueues.get(campaignId);
    if (queue) {
      this.updateCampaignStats(campaignId, queue);
    }

    this.activeCampaigns.set(campaignId, false);
    this.messageQueues.delete(campaignId);
    this.statsBatchCounter.delete(campaignId);
    this.queueStorage.deleteQueue(campaignId);

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
