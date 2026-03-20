import { Campaign, CampaignStatus } from './types';
import { CampaignStorage } from './campaignStorage';
import { LoggerService } from './loggerService';

export class CampaignManager {
  private campaigns: Map<string, Campaign> = new Map();
  private storage: CampaignStorage;
  private logger: LoggerService;
  private updateCallback?: (campaigns: Campaign[]) => void;

  constructor(storage: CampaignStorage, logger: LoggerService) {
    this.storage = storage;
    this.logger = logger;
    this.loadCampaigns();
    this.logger.info('CampaignManager initialized', { component: 'CampaignManager' });
  }

  setUpdateCallback(callback: (campaigns: Campaign[]) => void): void {
    this.updateCallback = callback;
  }

  private notifyUpdate(): void {
    if (this.updateCallback) {
      this.updateCallback(Array.from(this.campaigns.values()));
    }
  }

  private loadCampaigns(): void {
    const savedCampaigns = this.storage.loadCampaigns();
    savedCampaigns.forEach(campaign => {
      this.campaigns.set(campaign.id, campaign);
    });
  }

  createCampaign(
    campaignData: Omit<Campaign, 'id' | 'createdAt' | 'stats' | 'status'>
  ): string {
    const campaignId = `campaign-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const campaign: Campaign = {
      ...campaignData,
      id: campaignId,
      status: 'DRAFT',
      createdAt: Date.now(),
      stats: {
        total: campaignData.contacts.length,
        sent: 0,
        failed: 0,
        pending: campaignData.contacts.length,
      },
    };

    this.campaigns.set(campaignId, campaign);
    this.saveAllCampaigns();
    this.notifyUpdate();

    this.logger.success(`Campaign created successfully`, {
      component: 'CampaignManager',
      campaignId,
      metadata: { name: campaign.name, contactCount: campaign.contacts.length }
    });

    return campaignId;
  }

  getCampaign(campaignId: string): Campaign | null {
    return this.campaigns.get(campaignId) || null;
  }

  getAllCampaigns(): Campaign[] {
    return Array.from(this.campaigns.values());
  }

  updateCampaign(campaignId: string, updates: Partial<Campaign>): void {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) {
      this.logger.error(`Campaign not found for update`, {
        component: 'CampaignManager',
        campaignId
      });
      throw new Error(`Campaign ${campaignId} not found`);
    }

    const updatedCampaign = { ...campaign, ...updates };
    this.campaigns.set(campaignId, updatedCampaign);
    this.saveAllCampaigns();
    this.notifyUpdate();

    this.logger.info(`Campaign updated`, {
      component: 'CampaignManager',
      campaignId
    });
  }

  updateCampaignStatus(campaignId: string, status: CampaignStatus): void {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) {
      this.logger.error(`Campaign not found for status update`, {
        component: 'CampaignManager',
        campaignId
      });
      throw new Error(`Campaign ${campaignId} not found`);
    }

    campaign.status = status;

    if (status === 'RUNNING' && !campaign.startedAt) {
      campaign.startedAt = Date.now();
    }

    if (status === 'COMPLETED' || status === 'STOPPED') {
      campaign.completedAt = Date.now();
    }

    this.campaigns.set(campaignId, campaign);
    this.saveAllCampaigns();
    this.notifyUpdate();

    this.logger.info(`Campaign status updated to ${status}`, {
      component: 'CampaignManager',
      campaignId,
      metadata: { newStatus: status }
    });
  }

  updateCampaignStats(
    campaignId: string,
    stats: Partial<Campaign['stats']>
  ): void {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) {
      this.logger.error(`Campaign not found for stats update`, {
        component: 'CampaignManager',
        campaignId
      });
      throw new Error(`Campaign ${campaignId} not found`);
    }

    campaign.stats = { ...campaign.stats, ...stats };
    this.campaigns.set(campaignId, campaign);
    this.saveAllCampaigns();
    this.notifyUpdate();

    this.logger.debug(`Campaign stats updated`, {
      component: 'CampaignManager',
      campaignId,
      metadata: { stats: campaign.stats }
    });
  }

  deleteCampaign(campaignId: string): void {
    this.campaigns.delete(campaignId);
    this.storage.deleteCampaign(campaignId);
    this.notifyUpdate();

    this.logger.info(`Campaign deleted`, {
      component: 'CampaignManager',
      campaignId
    });
  }

  private saveAllCampaigns(): void {
    const campaigns = Array.from(this.campaigns.values());
    this.storage.saveCampaigns(campaigns);
  }
}
