import * as fs from 'fs';
import * as path from 'path';
import { LoggerService } from './loggerService';

interface ContactHistoryEntry {
  contact: string;
  campaignId: string;
  timestamp: number;
  deviceId: string;
}

interface ContactHistoryMetadata {
  entries: ContactHistoryEntry[];
  lastUpdated: number;
}

export class ContactHistory {
  private storagePath: string;
  private historyFile: string;
  private logger: LoggerService;
  private cache: Map<string, ContactHistoryEntry> = new Map();

  constructor(appDataPath: string, logger: LoggerService) {
    this.storagePath = path.join(appDataPath, 'history');
    this.historyFile = path.join(this.storagePath, 'contact-history.json');
    this.logger = logger;
    this.ensureStorageExists();
    this.loadHistoryToCache();
  }

  private ensureStorageExists(): void {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  private loadHistoryToCache(): void {
    try {
      if (!fs.existsSync(this.historyFile)) {
        return;
      }

      const content = fs.readFileSync(this.historyFile, 'utf-8');
      const metadata: ContactHistoryMetadata = JSON.parse(content);

      metadata.entries.forEach(entry => {
        this.cache.set(entry.contact, entry);
      });

      this.logger.info('Contact history loaded', {
        component: 'ContactHistory',
        metadata: { entryCount: this.cache.size }
      });
    } catch (error) {
      this.logger.error('Error loading contact history', {
        component: 'ContactHistory',
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  private saveHistory(): void {
    try {
      const entries = Array.from(this.cache.values());
      const metadata: ContactHistoryMetadata = {
        entries,
        lastUpdated: Date.now()
      };

      const tempFile = `${this.historyFile}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(metadata, null, 2), 'utf-8');

      if (fs.existsSync(this.historyFile)) {
        fs.unlinkSync(this.historyFile);
      }
      fs.renameSync(tempFile, this.historyFile);
    } catch (error) {
      this.logger.error('Error saving contact history', {
        component: 'ContactHistory',
        error: error instanceof Error ? error : new Error(String(error))
      });
      throw error;
    }
  }

  hasContact(contact: string): boolean {
    return this.cache.has(contact);
  }

  getContactEntry(contact: string): ContactHistoryEntry | undefined {
    return this.cache.get(contact);
  }

  addContact(contact: string, campaignId: string, deviceId: string): void {
    const entry: ContactHistoryEntry = {
      contact,
      campaignId,
      timestamp: Date.now(),
      deviceId
    };

    this.cache.set(contact, entry);
    this.saveHistory();

    this.logger.debug('Contact added to history', {
      component: 'ContactHistory',
      metadata: { contact, campaignId, deviceId }
    });
  }

  removeDuplicates(contacts: string[]): string[] {
    const unique: string[] = [];
    const seen = new Set<string>();

    contacts.forEach(contact => {
      if (!seen.has(contact)) {
        seen.add(contact);
        unique.push(contact);
      }
    });

    return unique;
  }

  filterUnsentContacts(contacts: string[]): {
    unsent: string[];
    duplicates: string[];
    duplicateDetails: ContactHistoryEntry[];
  } {
    const unsent: string[] = [];
    const duplicates: string[] = [];
    const duplicateDetails: ContactHistoryEntry[] = [];

    contacts.forEach(contact => {
      if (this.hasContact(contact)) {
        duplicates.push(contact);
        const entry = this.getContactEntry(contact);
        if (entry) {
          duplicateDetails.push(entry);
        }
      } else {
        unsent.push(contact);
      }
    });

    return { unsent, duplicates, duplicateDetails };
  }

  cleanupOldEntries(daysToKeep: number = 30): void {
    const now = Date.now();
    const maxAge = daysToKeep * 24 * 60 * 60 * 1000;
    let removedCount = 0;

    for (const [contact, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > maxAge) {
        this.cache.delete(contact);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.saveHistory();
      this.logger.info('Cleaned up old contact history entries', {
        component: 'ContactHistory',
        metadata: { removedCount, daysToKeep }
      });
    }
  }

  clearHistory(): void {
    this.cache.clear();
    if (fs.existsSync(this.historyFile)) {
      fs.unlinkSync(this.historyFile);
    }
    this.logger.info('Contact history cleared', {
      component: 'ContactHistory'
    });
  }

  getStats(): { totalContacts: number; oldestEntry: number | null; newestEntry: number | null } {
    const entries = Array.from(this.cache.values());
    const timestamps = entries.map(e => e.timestamp);

    return {
      totalContacts: this.cache.size,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : null
    };
  }
}
