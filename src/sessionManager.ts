import { BrowserWindow, session } from 'electron';
import * as path from 'path';
import { SessionData, SessionStatus } from './types';
import { SessionStorage } from './storage';
import { LoggerService } from './loggerService';

export class SessionManager {
  private sessions: Map<string, BrowserWindow> = new Map();
  private sessionData: Map<string, SessionData> = new Map();
  private storage: SessionStorage;
  private logger: LoggerService;
  private updateCallback?: (sessions: SessionData[]) => void;

  constructor(storage: SessionStorage, logger: LoggerService) {
    this.storage = storage;
    this.logger = logger;
    this.logger.info('SessionManager initialized', { component: 'SessionManager' });
  }

  setUpdateCallback(callback: (sessions: SessionData[]) => void): void {
    this.updateCallback = callback;
  }

  private notifyUpdate(): void {
    if (this.updateCallback) {
      this.updateCallback(Array.from(this.sessionData.values()));
    }
  }

  createSession(): string {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const partitionName = `persist:whatsapp-${sessionId}`;
    const userDataPath = this.storage.getSessionUserDataPath(sessionId);

    const sessionInfo: SessionData = {
      id: sessionId,
      status: 'LOADING',
      partitionName,
      userDataPath,
      createdAt: Date.now(),
      lastActive: Date.now(),
      isVisible: true,
    };

    try {
      const browserWindow = this.createBrowserWindow(sessionInfo, true);
      this.sessions.set(sessionId, browserWindow);
      this.sessionData.set(sessionId, sessionInfo);

      this.setupWindowHandlers(sessionId, browserWindow);

      browserWindow.webContents.on('render-process-gone', (event, details) => {
        this.logger.error(`Session render process terminated`, {
          component: 'SessionManager',
          deviceId: sessionId,
          metadata: { reason: details.reason, exitCode: details.exitCode }
        });
        this.handleSessionCrash(sessionId);
      });

      browserWindow.webContents.on('unresponsive', () => {
        this.logger.warning(`Session became unresponsive`, {
          component: 'SessionManager',
          deviceId: sessionId
        });
      });

      browserWindow.loadURL('https://web.whatsapp.com').catch(err => {
        this.logger.error(`Failed to load WhatsApp Web`, {
          component: 'SessionManager',
          deviceId: sessionId,
          error: err instanceof Error ? err : new Error(String(err))
        });
        sessionInfo.status = 'QR_REQUIRED';
        this.sessionData.set(sessionId, sessionInfo);
        this.notifyUpdate();
      });

      this.saveAllSessions();
      this.notifyUpdate();

      this.logger.success(`Session created successfully`, {
        component: 'SessionManager',
        deviceId: sessionId
      });

      return sessionId;
    } catch (error) {
      this.logger.error('Failed to create session', {
        component: 'SessionManager',
        error: error instanceof Error ? error : new Error(String(error))
      });
      throw error;
    }
  }

  private createBrowserWindow(sessionInfo: SessionData, visible: boolean): BrowserWindow {
    const ses = session.fromPartition(sessionInfo.partitionName, {
      cache: true,
    });

    ses.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');

    ses.setPermissionRequestHandler((webContents, permission, callback) => {
      const allowedPermissions = ['notifications', 'media', 'clipboard-read', 'clipboard-sanitized-write'];
      callback(allowedPermissions.includes(permission));
    });

    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      show: visible,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        partition: sessionInfo.partitionName,
        session: ses,
        backgroundThrottling: false,
        v8CacheOptions: 'code',
        enableWebSQL: false,
        spellcheck: false,
        webgl: true,
      },
    });

    win.setMenuBarVisibility(false);

    return win;
  }

  private setupWindowHandlers(sessionId: string, browserWindow: BrowserWindow): void {
    browserWindow.webContents.on('did-finish-load', () => {
      this.checkSessionStatus(sessionId);
    });

    browserWindow.webContents.on('did-navigate', () => {
      this.checkSessionStatus(sessionId);
    });

    browserWindow.webContents.on('page-title-updated', (event, title) => {
      if (title && title.includes('WhatsApp')) {
        const sessionInfo = this.sessionData.get(sessionId);
        if (sessionInfo && sessionInfo.status !== 'ACTIVE') {
          const hasNumber = /\(\d+\)/.test(title) || title === 'WhatsApp';
          if (hasNumber || title === 'WhatsApp') {
            this.transitionToHeadless(sessionId);
          }
        }
      }
    });

    browserWindow.on('close', (event) => {
      const sessionInfo = this.sessionData.get(sessionId);
      if (sessionInfo && sessionInfo.status === 'ACTIVE') {
        event.preventDefault();
        browserWindow.hide();
        sessionInfo.isVisible = false;
        this.sessionData.set(sessionId, sessionInfo);
        this.saveAllSessions();
        this.notifyUpdate();
      }
    });

    browserWindow.on('closed', () => {
      const sessionInfo = this.sessionData.get(sessionId);
      if (sessionInfo && sessionInfo.status !== 'ACTIVE') {
        this.deleteSession(sessionId);
      }
    });
  }

  private async checkSessionStatus(sessionId: string): Promise<void> {
    const browserWindow = this.sessions.get(sessionId);
    const sessionInfo = this.sessionData.get(sessionId);

    if (!browserWindow || !sessionInfo) return;

    try {
      const url = browserWindow.webContents.getURL();
      const title = browserWindow.webContents.getTitle();

      let newStatus: SessionStatus = sessionInfo.status;

      if (url.includes('web.whatsapp.com')) {
        if (title.includes('WhatsApp') && (title === 'WhatsApp' || /\(\d+\)/.test(title))) {
          newStatus = 'ACTIVE';
        } else {
          newStatus = 'QR_REQUIRED';
        }
      } else {
        newStatus = 'LOADING';
      }

      if (newStatus !== sessionInfo.status) {
        sessionInfo.status = newStatus;
        sessionInfo.lastActive = Date.now();
        this.sessionData.set(sessionId, sessionInfo);
        this.saveAllSessions();
        this.notifyUpdate();
      }
    } catch (error) {
      this.logger.error(`Error checking session status`, {
        component: 'SessionManager',
        deviceId: sessionId,
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  private transitionToHeadless(sessionId: string): void {
    const browserWindow = this.sessions.get(sessionId);
    const sessionInfo = this.sessionData.get(sessionId);

    if (!browserWindow || !sessionInfo) return;

    sessionInfo.status = 'ACTIVE';
    sessionInfo.isVisible = false;
    sessionInfo.lastActive = Date.now();
    this.sessionData.set(sessionId, sessionInfo);

    browserWindow.hide();

    this.saveAllSessions();
    this.notifyUpdate();

    this.logger.info(`Session transitioned to headless mode`, {
      component: 'SessionManager',
      deviceId: sessionId
    });
  }

  openChatWindow(sessionId: string): void {
    const browserWindow = this.sessions.get(sessionId);
    const sessionInfo = this.sessionData.get(sessionId);

    if (!browserWindow || !sessionInfo) {
      this.logger.error(`Session not found`, {
        component: 'SessionManager',
        deviceId: sessionId
      });
      return;
    }

    if (browserWindow.isDestroyed()) {
      this.logger.error(`Session window is destroyed`, {
        component: 'SessionManager',
        deviceId: sessionId
      });
      this.deleteSession(sessionId);
      return;
    }

    try {
      browserWindow.show();
      browserWindow.focus();
      sessionInfo.isVisible = true;
      sessionInfo.lastActive = Date.now();
      this.sessionData.set(sessionId, sessionInfo);

      this.saveAllSessions();
      this.notifyUpdate();
    } catch (error) {
      this.logger.error(`Error opening chat window`, {
        component: 'SessionManager',
        deviceId: sessionId,
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  refreshSession(sessionId: string): void {
    const browserWindow = this.sessions.get(sessionId);
    const sessionInfo = this.sessionData.get(sessionId);

    if (!browserWindow || !sessionInfo) {
      this.logger.error(`Session not found`, {
        component: 'SessionManager',
        deviceId: sessionId
      });
      return;
    }

    if (browserWindow.isDestroyed()) {
      this.logger.error(`Session window is destroyed`, {
        component: 'SessionManager',
        deviceId: sessionId
      });
      this.deleteSession(sessionId);
      return;
    }

    try {
      sessionInfo.status = 'LOADING';
      sessionInfo.lastActive = Date.now();
      this.sessionData.set(sessionId, sessionInfo);

      browserWindow.reload();

      this.saveAllSessions();
      this.notifyUpdate();
    } catch (error) {
      this.logger.error(`Error refreshing session`, {
        component: 'SessionManager',
        deviceId: sessionId,
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  deleteSession(sessionId: string): void {
    const browserWindow = this.sessions.get(sessionId);

    if (browserWindow && !browserWindow.isDestroyed()) {
      browserWindow.removeAllListeners();
      browserWindow.destroy();
    }

    this.sessions.delete(sessionId);
    this.sessionData.delete(sessionId);

    this.storage.deleteSession(sessionId);
    this.storage.deleteSessionUserData(sessionId);

    this.notifyUpdate();
  }

  async restoreSessions(): Promise<void> {
    const savedSessions = this.storage.loadSessions();

    for (const sessionInfo of savedSessions) {
      try {
        const browserWindow = this.createBrowserWindow(sessionInfo, false);
        this.sessions.set(sessionInfo.id, browserWindow);
        this.sessionData.set(sessionInfo.id, sessionInfo);

        this.setupWindowHandlers(sessionInfo.id, browserWindow);

        sessionInfo.status = 'LOADING';

        browserWindow.webContents.on('render-process-gone', (event, details) => {
          this.logger.error(`Session render process terminated during restoration`, {
            component: 'SessionManager',
            deviceId: sessionInfo.id,
            metadata: { reason: details.reason, exitCode: details.exitCode }
          });
          this.handleSessionCrash(sessionInfo.id);
        });

        browserWindow.webContents.on('unresponsive', () => {
          this.logger.warning(`Session became unresponsive during restoration`, {
            component: 'SessionManager',
            deviceId: sessionInfo.id
          });
        });

        browserWindow.loadURL('https://web.whatsapp.com').catch(err => {
          this.logger.error(`Failed to load WhatsApp Web during restoration`, {
            component: 'SessionManager',
            deviceId: sessionInfo.id,
            error: err instanceof Error ? err : new Error(String(err))
          });
          sessionInfo.status = 'QR_REQUIRED';
          this.sessionData.set(sessionInfo.id, sessionInfo);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        this.logger.error(`Error restoring session`, {
          component: 'SessionManager',
          deviceId: sessionInfo.id,
          error: error instanceof Error ? error : new Error(String(error))
        });
        this.storage.deleteSession(sessionInfo.id);
      }
    }

    this.notifyUpdate();
  }

  private handleSessionCrash(sessionId: string): void {
    const sessionInfo = this.sessionData.get(sessionId);
    if (!sessionInfo) return;

    const browserWindow = this.sessions.get(sessionId);
    if (browserWindow && !browserWindow.isDestroyed()) {
      try {
        browserWindow.reload();
        this.logger.info(`Session reloaded after crash`, {
          component: 'SessionManager',
          deviceId: sessionId
        });
      } catch (error) {
        this.logger.error(`Failed to reload crashed session`, {
          component: 'SessionManager',
          deviceId: sessionId,
          error: error instanceof Error ? error : new Error(String(error))
        });
        this.deleteSession(sessionId);
      }
    }
  }

  getAllSessions(): SessionData[] {
    return Array.from(this.sessionData.values());
  }

  private saveAllSessions(): void {
    const sessions = Array.from(this.sessionData.values());
    this.storage.saveSessions(sessions);
  }

  cleanup(): void {
    for (const [sessionId, browserWindow] of this.sessions.entries()) {
      if (!browserWindow.isDestroyed()) {
        browserWindow.removeAllListeners();
        browserWindow.destroy();
      }
    }
    this.sessions.clear();
    this.sessionData.clear();
  }
}
