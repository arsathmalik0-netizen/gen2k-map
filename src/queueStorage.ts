import * as fs from 'fs';
import * as path from 'path';
import { MessageQueueItem } from './types';

interface QueueMetadata {
  campaignId: string;
  queue: MessageQueueItem[];
  lastUpdated: number;
  checkpoints: number[];
}

export class QueueStorage {
  private storagePath: string;

  constructor(appDataPath: string) {
    this.storagePath = path.join(appDataPath, 'queues');
    this.ensureStorageExists();
  }

  private ensureStorageExists(): void {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  private getQueueFile(campaignId: string): string {
    return path.join(this.storagePath, `campaign-${campaignId}-queue.json`);
  }

  private getCheckpointFile(campaignId: string): string {
    return path.join(this.storagePath, `campaign-${campaignId}-checkpoint.json`);
  }

  saveQueue(campaignId: string, queue: MessageQueueItem[]): void {
    try {
      const metadata: QueueMetadata = {
        campaignId,
        queue,
        lastUpdated: Date.now(),
        checkpoints: [],
      };

      const queueFile = this.getQueueFile(campaignId);
      const tempFile = `${queueFile}.tmp`;

      fs.writeFileSync(tempFile, JSON.stringify(metadata, null, 2), 'utf-8');

      if (fs.existsSync(queueFile)) {
        fs.unlinkSync(queueFile);
      }
      fs.renameSync(tempFile, queueFile);
    } catch (error) {
      console.error(`Error saving queue for campaign ${campaignId}:`, error);
      throw error;
    }
  }

  saveCheckpoint(campaignId: string, queue: MessageQueueItem[]): void {
    try {
      const checkpointFile = this.getCheckpointFile(campaignId);
      const tempFile = `${checkpointFile}.tmp`;

      const checkpoint = {
        campaignId,
        queue,
        timestamp: Date.now(),
      };

      fs.writeFileSync(tempFile, JSON.stringify(checkpoint, null, 2), 'utf-8');

      if (fs.existsSync(checkpointFile)) {
        fs.unlinkSync(checkpointFile);
      }
      fs.renameSync(tempFile, checkpointFile);
    } catch (error) {
      console.error(`Error saving checkpoint for campaign ${campaignId}:`, error);
    }
  }

  loadQueue(campaignId: string): MessageQueueItem[] | null {
    try {
      const queueFile = this.getQueueFile(campaignId);

      if (!fs.existsSync(queueFile)) {
        return null;
      }

      const content = fs.readFileSync(queueFile, 'utf-8');
      const metadata: QueueMetadata = JSON.parse(content);

      if (!this.validateQueue(metadata.queue)) {
        console.warn(`Queue for campaign ${campaignId} is corrupted, attempting checkpoint recovery`);
        return this.loadCheckpoint(campaignId);
      }

      return metadata.queue || [];
    } catch (error) {
      console.error(`Error loading queue for campaign ${campaignId}:`, error);
      return this.loadCheckpoint(campaignId);
    }
  }

  loadCheckpoint(campaignId: string): MessageQueueItem[] | null {
    try {
      const checkpointFile = this.getCheckpointFile(campaignId);

      if (!fs.existsSync(checkpointFile)) {
        return null;
      }

      const content = fs.readFileSync(checkpointFile, 'utf-8');
      const checkpoint = JSON.parse(content);

      return checkpoint.queue || [];
    } catch (error) {
      console.error(`Error loading checkpoint for campaign ${campaignId}:`, error);
      return null;
    }
  }

  private validateQueue(queue: MessageQueueItem[]): boolean {
    if (!Array.isArray(queue)) {
      return false;
    }

    for (const item of queue) {
      if (!item.id || !item.campaignId || !item.contact || !item.deviceId || !item.status) {
        return false;
      }
    }

    return true;
  }

  deleteQueue(campaignId: string): void {
    try {
      const queueFile = this.getQueueFile(campaignId);
      const checkpointFile = this.getCheckpointFile(campaignId);

      if (fs.existsSync(queueFile)) {
        fs.unlinkSync(queueFile);
      }

      if (fs.existsSync(checkpointFile)) {
        fs.unlinkSync(checkpointFile);
      }
    } catch (error) {
      console.error(`Error deleting queue for campaign ${campaignId}:`, error);
    }
  }

  getAllQueueFiles(): string[] {
    try {
      const files = fs.readdirSync(this.storagePath);
      return files
        .filter(file => file.startsWith('campaign-') && file.endsWith('-queue.json'))
        .map(file => file.replace('campaign-', '').replace('-queue.json', ''));
    } catch (error) {
      console.error('Error reading queue files:', error);
      return [];
    }
  }

  cleanupOldQueues(daysToKeep: number = 7): void {
    try {
      const files = fs.readdirSync(this.storagePath);
      const now = Date.now();
      const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

      files.forEach(file => {
        const filePath = path.join(this.storagePath, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`Deleted old queue file: ${file}`);
        }
      });
    } catch (error) {
      console.error('Error cleaning up old queues:', error);
    }
  }
}
