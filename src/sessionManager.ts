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
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();

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

  private async verifyWhatsAppAuthentication(sessionId: string): Promise<boolean> {
    const browserWindow = this.sessions.get(sessionId);
    const sessionInfo = this.sessionData.get(sessionId);

    if (!browserWindow || !sessionInfo) return false;

    try {
      const ses = session.fromPartition(sessionInfo.partitionName);
      const cookies = await ses.cookies.get({ url: 'https://web.whatsapp.com' });

      const hasAuthCookies = cookies.some(cookie =>
        cookie.name.includes('wa_') ||
        cookie.name.includes('wam') ||
        cookie.name.includes('WABrowserId') ||
        cookie.name.includes('WASecretBundle')
      );

      if (!sessionInfo.authState) {
        sessionInfo.authState = {
          lastVerified: Date.now(),
          hasAuthCookies,
          verificationAttempts: 1
        };
      } else {
        sessionInfo.authState.lastVerified = Date.now();
        sessionInfo.authState.hasAuthCookies = hasAuthCookies;
        sessionInfo.authState.verificationAttempts++;
      }

      this.sessionData.set(sessionId, sessionInfo);

      if (hasAuthCookies && cookies.length > 0) {
        this.logger.info('Authentication cookies found, session should auto-login', {
          component: 'SessionManager',
          deviceId: sessionId,
          metadata: { cookieCount: cookies.length }
        });
        return true;
      }

      const hasLocalStorage = await browserWindow.webContents.executeJavaScript(`
        (function() {
          try {
            return localStorage.length > 0 &&
                   (localStorage.getItem('WABrowserId') !== null ||
                    localStorage.getItem('WASecretBundle') !== null ||
                    Object.keys(localStorage).some(key => key.includes('wa') || key.includes('WA')));
          } catch(e) {
            return false;
          }
        })()
      `).catch(() => false);

      if (hasLocalStorage) {
        this.logger.info('Authentication localStorage found, session should auto-login', {
          component: 'SessionManager',
          deviceId: sessionId
        });
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Error verifying WhatsApp authentication', {
        component: 'SessionManager',
        deviceId: sessionId,
        error: error instanceof Error ? error : new Error(String(error))
      });
      return false;
    }
  }

  private async intelligentStatusDetection(sessionId: string): Promise<void> {
    const browserWindow = this.sessions.get(sessionId);
    const sessionInfo = this.sessionData.get(sessionId);

    if (!browserWindow || !sessionInfo) return;

    this.logger.info('Starting intelligent status detection', {
      component: 'SessionManager',
      deviceId: sessionId
    });

    const hasAuth = await this.verifyWhatsAppAuthentication(sessionId);

    if (hasAuth) {
      this.logger.success('Authentication verified, waiting for WhatsApp to load', {
        component: 'SessionManager',
        deviceId: sessionId
      });

      const maxAttempts = 15;
      let attempt = 0;

      const checkInterval = setInterval(async () => {
        attempt++;

        try {
          const title = browserWindow.webContents.getTitle();
          const url = browserWindow.webContents.getURL();

          const isAuthenticated = title.includes('WhatsApp') &&
                                 (title === 'WhatsApp' || /\(\d+\)/.test(title));

          const isQRPage = await browserWindow.webContents.executeJavaScript(`
            (function() {
              try {
                const canvas = document.querySelector('canvas[aria-label]');
                const qrContainer = document.querySelector('[data-ref]');
                return !!(canvas || qrContainer);
              } catch(e) {
                return false;
              }
            })()
          `).catch(() => false);

          if (isAuthenticated && !isQRPage) {
            clearInterval(checkInterval);
            sessionInfo.status = 'ACTIVE';
            sessionInfo.lastActive = Date.now();
            this.sessionData.set(sessionId, sessionInfo);
            this.saveAllSessions();
            this.notifyUpdate();
            this.startHealthCheck(sessionId);

            this.logger.success('Session automatically restored to ACTIVE state', {
              component: 'SessionManager',
              deviceId: sessionId,
              metadata: { attempts: attempt }
            });
          } else if (isQRPage && attempt > 3) {
            clearInterval(checkInterval);
            sessionInfo.status = 'QR_REQUIRED';
            this.sessionData.set(sessionId, sessionInfo);
            this.saveAllSessions();
            this.notifyUpdate();

            this.logger.warning('Session requires QR authentication', {
              component: 'SessionManager',
              deviceId: sessionId
            });
          } else if (attempt >= maxAttempts) {
            clearInterval(checkInterval);
            sessionInfo.status = 'QR_REQUIRED';
            this.sessionData.set(sessionId, sessionInfo);
            this.saveAllSessions();
            this.notifyUpdate();

            this.logger.warning('Status detection timeout, defaulting to QR_REQUIRED', {
              component: 'SessionManager',
              deviceId: sessionId
            });
          }
        } catch (error) {
          this.logger.error('Error during status detection', {
            component: 'SessionManager',
            deviceId: sessionId,
            error: error instanceof Error ? error : new Error(String(error))
          });
        }
      }, 2000);
    } else {
      this.logger.info('No authentication data found, QR scan required', {
        component: 'SessionManager',
        deviceId: sessionId
      });
      sessionInfo.status = 'QR_REQUIRED';
      this.sessionData.set(sessionId, sessionInfo);
      this.saveAllSessions();
      this.notifyUpdate();
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
    this.startHealthCheck(sessionId);

    this.logger.info(`Session transitioned to headless mode`, {
      component: 'SessionManager',
      deviceId: sessionId
    });
  }

  private startHealthCheck(sessionId: string): void {
    if (this.healthCheckIntervals.has(sessionId)) {
      clearInterval(this.healthCheckIntervals.get(sessionId));
    }

    const interval = setInterval(async () => {
      await this.performHealthCheck(sessionId);
    }, 5 * 60 * 1000);

    this.healthCheckIntervals.set(sessionId, interval);

    this.logger.info('Health check started for session', {
      component: 'SessionManager',
      deviceId: sessionId
    });
  }

  private stopHealthCheck(sessionId: string): void {
    const interval = this.healthCheckIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(sessionId);
    }
  }

  private async performHealthCheck(sessionId: string): Promise<void> {
    const browserWindow = this.sessions.get(sessionId);
    const sessionInfo = this.sessionData.get(sessionId);

    if (!browserWindow || !sessionInfo || browserWindow.isDestroyed()) {
      this.stopHealthCheck(sessionId);
      return;
    }

    if (sessionInfo.status !== 'ACTIVE') {
      return;
    }

    try {
      sessionInfo.lastHealthCheck = Date.now();

      const title = browserWindow.webContents.getTitle();
      const url = browserWindow.webContents.getURL();

      const isStillAuthenticated = title.includes('WhatsApp') &&
                                   (title === 'WhatsApp' || /\(\d+\)/.test(title));

      if (!isStillAuthenticated) {
        this.logger.warning('Health check failed, session may have been logged out', {
          component: 'SessionManager',
          deviceId: sessionId
        });

        await this.attemptSessionRepair(sessionId);
      } else {
        sessionInfo.lastActive = Date.now();
        this.sessionData.set(sessionId, sessionInfo);
        this.saveAllSessions();

        this.logger.info('Health check passed', {
          component: 'SessionManager',
          deviceId: sessionId
        });
      }
    } catch (error) {
      this.logger.error('Error during health check', {
        component: 'SessionManager',
        deviceId: sessionId,
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  private async attemptSessionRepair(sessionId: string): Promise<void> {
    const browserWindow = this.sessions.get(sessionId);
    const sessionInfo = this.sessionData.get(sessionId);

    if (!browserWindow || !sessionInfo) return;

    this.logger.info('Attempting to repair session', {
      component: 'SessionManager',
      deviceId: sessionId
    });

    try {
      const hasAuth = await this.verifyWhatsAppAuthentication(sessionId);

      if (hasAuth) {
        this.logger.info('Auth data still present, reloading page', {
          component: 'SessionManager',
          deviceId: sessionId
        });

        browserWindow.reload();

        await new Promise(resolve => setTimeout(resolve, 5000));

        const title = browserWindow.webContents.getTitle();
        const isAuthenticated = title.includes('WhatsApp') &&
                               (title === 'WhatsApp' || /\(\d+\)/.test(title));

        if (isAuthenticated) {
          sessionInfo.status = 'ACTIVE';
          sessionInfo.lastActive = Date.now();
          this.sessionData.set(sessionId, sessionInfo);
          this.saveAllSessions();
          this.notifyUpdate();

          this.logger.success('Session repaired successfully', {
            component: 'SessionManager',
            deviceId: sessionId
          });
        } else {
          this.logger.warning('Repair failed, session needs re-authentication', {
            component: 'SessionManager',
            deviceId: sessionId
          });
          sessionInfo.status = 'QR_REQUIRED';
          this.sessionData.set(sessionId, sessionInfo);
          this.saveAllSessions();
          this.notifyUpdate();
          this.stopHealthCheck(sessionId);
        }
      } else {
        this.logger.warning('No auth data found, session needs QR scan', {
          component: 'SessionManager',
          deviceId: sessionId
        });
        sessionInfo.status = 'QR_REQUIRED';
        this.sessionData.set(sessionId, sessionInfo);
        this.saveAllSessions();
        this.notifyUpdate();
        this.stopHealthCheck(sessionId);
      }
    } catch (error) {
      this.logger.error('Error during session repair', {
        component: 'SessionManager',
        deviceId: sessionId,
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
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

    this.stopHealthCheck(sessionId);

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

    this.logger.info(`Restoring ${savedSessions.length} saved sessions`, {
      component: 'SessionManager'
    });

    for (const sessionInfo of savedSessions) {
      try {
        const wasActive = sessionInfo.status === 'ACTIVE';

        if (wasActive) {
          sessionInfo.status = 'RESTORING';
          this.logger.info(`Restoring previously ACTIVE session`, {
            component: 'SessionManager',
            deviceId: sessionInfo.id
          });
        } else {
          sessionInfo.status = 'LOADING';
        }

        const browserWindow = this.createBrowserWindow(sessionInfo, false);
        this.sessions.set(sessionInfo.id, browserWindow);
        this.sessionData.set(sessionInfo.id, sessionInfo);

        this.setupWindowHandlers(sessionInfo.id, browserWindow);

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

        browserWindow.webContents.on('did-finish-load', async () => {
          if (wasActive) {
            await this.intelligentStatusDetection(sessionInfo.id);
          }
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
    for (const sessionId of this.healthCheckIntervals.keys()) {
      this.stopHealthCheck(sessionId);
    }

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
