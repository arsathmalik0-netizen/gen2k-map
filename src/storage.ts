import * as fs from 'fs';
import * as path from 'path';
import { SessionData, SessionMetadata } from './types';

export class SessionStorage {
  private storagePath: string;
  private metadataFile: string;

  constructor(appDataPath: string) {
    this.storagePath = path.join(appDataPath, 'sessions');
    this.metadataFile = path.join(this.storagePath, 'sessions.json');
    this.ensureStorageExists();
  }

  private ensureStorageExists(): void {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  saveSessions(sessions: SessionData[]): void {
    try {
      const metadata: SessionMetadata = {
        sessions,
        lastUpdated: Date.now(),
      };

      const tempFile = `${this.metadataFile}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(metadata, null, 2), 'utf-8');

      if (fs.existsSync(this.metadataFile)) {
        fs.unlinkSync(this.metadataFile);
      }
      fs.renameSync(tempFile, this.metadataFile);
    } catch (error) {
      console.error('Error saving sessions:', error);
      throw error;
    }
  }

  loadSessions(): SessionData[] {
    try {
      if (!fs.existsSync(this.metadataFile)) {
        return [];
      }

      const content = fs.readFileSync(this.metadataFile, 'utf-8');
      const metadata: SessionMetadata = JSON.parse(content);
      return metadata.sessions || [];
    } catch (error) {
      console.error('Error loading sessions:', error);
      return [];
    }
  }

  deleteSession(sessionId: string): void {
    const sessions = this.loadSessions();
    const filtered = sessions.filter(s => s.id !== sessionId);
    this.saveSessions(filtered);
  }

  clearAllSessions(): void {
    if (fs.existsSync(this.metadataFile)) {
      fs.unlinkSync(this.metadataFile);
    }
  }

  getSessionUserDataPath(sessionId: string): string {
    return path.join(this.storagePath, 'userData', sessionId);
  }

  deleteSessionUserData(sessionId: string): void {
    try {
      const userDataPath = this.getSessionUserDataPath(sessionId);
      if (fs.existsSync(userDataPath)) {
        fs.rmSync(userDataPath, { recursive: true, force: true });
      }
    } catch (error) {
      console.error(`Error deleting user data for session ${sessionId}:`, error);
    }
  }
}
