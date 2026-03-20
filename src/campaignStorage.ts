import * as fs from 'fs';
import * as path from 'path';
import { Campaign, CampaignMetadata } from './types';

export class CampaignStorage {
  private storagePath: string;
  private metadataFile: string;

  constructor(appDataPath: string) {
    this.storagePath = path.join(appDataPath, 'campaigns');
    this.metadataFile = path.join(this.storagePath, 'campaigns.json');
    this.ensureStorageExists();
  }

  private ensureStorageExists(): void {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  saveCampaigns(campaigns: Campaign[]): void {
    try {
      const metadata: CampaignMetadata = {
        campaigns,
        lastUpdated: Date.now(),
      };

      const tempFile = `${this.metadataFile}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(metadata, null, 2), 'utf-8');

      if (fs.existsSync(this.metadataFile)) {
        fs.unlinkSync(this.metadataFile);
      }
      fs.renameSync(tempFile, this.metadataFile);
    } catch (error) {
      console.error('Error saving campaigns:', error);
      throw error;
    }
  }

  loadCampaigns(): Campaign[] {
    try {
      if (!fs.existsSync(this.metadataFile)) {
        return [];
      }

      const content = fs.readFileSync(this.metadataFile, 'utf-8');
      const metadata: CampaignMetadata = JSON.parse(content);
      return metadata.campaigns || [];
    } catch (error) {
      console.error('Error loading campaigns:', error);
      return [];
    }
  }

  deleteCampaign(campaignId: string): void {
    const campaigns = this.loadCampaigns();
    const filtered = campaigns.filter(c => c.id !== campaignId);
    this.saveCampaigns(filtered);
  }

  clearAllCampaigns(): void {
    if (fs.existsSync(this.metadataFile)) {
      fs.unlinkSync(this.metadataFile);
    }
  }
}
