import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { SessionStorage } from './storage';
import { SessionManager } from './sessionManager';
import { CampaignStorage } from './campaignStorage';
import { CampaignManager } from './campaignManager';
import { SendingEngine } from './sendingEngine';
import { Logger } from './logger';
import { LoggerService } from './loggerService';
import { QueueStorage } from './queueStorage';
import { Campaign, LogFilter } from './types';

app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder');
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow: BrowserWindow | null = null;
let sessionManager: SessionManager | null = null;
let storage: SessionStorage | null = null;
let campaignStorage: CampaignStorage | null = null;
let campaignManager: CampaignManager | null = null;
let sendingEngine: SendingEngine | null = null;
let logger: Logger | null = null;
let enhancedLogger: LoggerService | null = null;
let queueStorage: QueueStorage | null = null;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.js'),
      v8CacheOptions: 'code',
      enableWebSQL: false,
      spellcheck: false,
      webgl: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function safeIPCHandler<T extends any[], R>(
  handlerName: string,
  handler: (...args: T) => R | Promise<R>
): (...args: T) => Promise<{ success: boolean; data?: R; error?: string }> {
  return async (...args: T) => {
    try {
      const result = await handler(...args);
      return { success: true, data: result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (enhancedLogger) {
        enhancedLogger.error(`IPC Handler Error: ${handlerName}`, {
          component: 'IPC',
          error: error instanceof Error ? error : new Error(String(error)),
          metadata: { handler: handlerName }
        });
      }
      return { success: false, error: errorMessage };
    }
  };
}

function setupIPC(): void {
  if (!sessionManager || !campaignManager || !sendingEngine || !logger) return;

  ipcMain.handle('session:add', safeIPCHandler('session:add', () => {
    if (!sessionManager) throw new Error('SessionManager not initialized');
    const sessionId = sessionManager.createSession();
    return sessionId;
  }));

  ipcMain.handle('session:delete', safeIPCHandler('session:delete', (event: any, sessionId: string) => {
    if (!sessionManager) throw new Error('SessionManager not initialized');
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Invalid session ID');
    }
    sessionManager.deleteSession(sessionId);
    return { deleted: sessionId };
  }));

  ipcMain.handle('session:open-chat', safeIPCHandler('session:open-chat', (event: any, sessionId: string) => {
    if (!sessionManager) throw new Error('SessionManager not initialized');
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Invalid session ID');
    }
    sessionManager.openChatWindow(sessionId);
    return { opened: sessionId };
  }));

  ipcMain.handle('session:refresh', safeIPCHandler('session:refresh', (event: any, sessionId: string) => {
    if (!sessionManager) throw new Error('SessionManager not initialized');
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Invalid session ID');
    }
    sessionManager.refreshSession(sessionId);
    return { refreshed: sessionId };
  }));

  ipcMain.handle('session:list', safeIPCHandler('session:list', () => {
    if (!sessionManager) throw new Error('SessionManager not initialized');
    return sessionManager.getAllSessions();
  }));

  sessionManager.setUpdateCallback((sessions) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('session:updated', sessions);
    }
  });

  ipcMain.handle('campaign:create', safeIPCHandler('campaign:create', (event: any, campaignData: Omit<Campaign, 'id' | 'createdAt' | 'stats' | 'status'>) => {
    if (!campaignManager) throw new Error('CampaignManager not initialized');
    if (!campaignData || typeof campaignData !== 'object') {
      throw new Error('Invalid campaign data');
    }
    if (!campaignData.name || campaignData.name.length < 1) {
      throw new Error('Campaign name is required');
    }
    if (!campaignData.message || campaignData.message.length < 1) {
      throw new Error('Campaign message is required');
    }
    if (!Array.isArray(campaignData.contacts) || campaignData.contacts.length === 0) {
      throw new Error('At least one contact is required');
    }
    if (campaignData.minDelay < 0 || campaignData.maxDelay < 0) {
      throw new Error('Delays must be positive');
    }
    if (campaignData.minDelay > campaignData.maxDelay) {
      throw new Error('Min delay must be less than max delay');
    }
    const campaignId = campaignManager.createCampaign(campaignData);
    return campaignId;
  }));

  ipcMain.handle('campaign:list', safeIPCHandler('campaign:list', () => {
    if (!campaignManager) throw new Error('CampaignManager not initialized');
    return campaignManager.getAllCampaigns();
  }));

  ipcMain.handle('campaign:get', safeIPCHandler('campaign:get', (event: any, campaignId: string) => {
    if (!campaignManager) throw new Error('CampaignManager not initialized');
    if (!campaignId || typeof campaignId !== 'string') {
      throw new Error('Invalid campaign ID');
    }
    return campaignManager.getCampaign(campaignId);
  }));

  ipcMain.handle('campaign:delete', safeIPCHandler('campaign:delete', (event: any, campaignId: string) => {
    if (!campaignManager) throw new Error('CampaignManager not initialized');
    if (!campaignId || typeof campaignId !== 'string') {
      throw new Error('Invalid campaign ID');
    }
    campaignManager.deleteCampaign(campaignId);
    return { deleted: campaignId };
  }));

  ipcMain.handle('campaign:start', safeIPCHandler('campaign:start', async (event: any, campaignId: string) => {
    if (!sendingEngine) throw new Error('SendingEngine not initialized');
    if (!sessionManager) throw new Error('SessionManager not initialized');
    if (!campaignManager) throw new Error('CampaignManager not initialized');
    if (!campaignId || typeof campaignId !== 'string') {
      throw new Error('Invalid campaign ID');
    }

    const campaign = campaignManager.getCampaign(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const sessions = sessionManager.getAllSessions();
    const deviceWindows = new Map();

    sessions.forEach(session => {
      if (session.status === 'ACTIVE' && campaign.selectedDevices.includes(session.id)) {
        const win = (sessionManager as any).sessions.get(session.id);
        if (win && !win.isDestroyed()) {
          deviceWindows.set(session.id, win);
        }
      }
    });

    if (deviceWindows.size === 0) {
      throw new Error('No active devices available');
    }

    await sendingEngine.startCampaign(campaignId, deviceWindows);
    return { started: campaignId, deviceCount: deviceWindows.size };
  }));

  ipcMain.handle('campaign:pause', safeIPCHandler('campaign:pause', (event: any, campaignId: string) => {
    if (!sendingEngine) throw new Error('SendingEngine not initialized');
    if (!campaignId || typeof campaignId !== 'string') {
      throw new Error('Invalid campaign ID');
    }
    sendingEngine.pauseCampaign(campaignId);
    return { paused: campaignId };
  }));

  ipcMain.handle('campaign:resume', safeIPCHandler('campaign:resume', (event: any, campaignId: string) => {
    if (!sendingEngine) throw new Error('SendingEngine not initialized');
    if (!sessionManager) throw new Error('SessionManager not initialized');
    if (!campaignManager) throw new Error('CampaignManager not initialized');
    if (!campaignId || typeof campaignId !== 'string') {
      throw new Error('Invalid campaign ID');
    }

    const campaign = campaignManager.getCampaign(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const sessions = sessionManager.getAllSessions();
    const deviceWindows = new Map();

    sessions.forEach(session => {
      if (session.status === 'ACTIVE' && campaign.selectedDevices.includes(session.id)) {
        const win = (sessionManager as any).sessions.get(session.id);
        if (win && !win.isDestroyed()) {
          deviceWindows.set(session.id, win);
        }
      }
    });

    sendingEngine.resumeCampaign(campaignId, deviceWindows);
    return { resumed: campaignId, deviceCount: deviceWindows.size };
  }));

  ipcMain.handle('campaign:stop', safeIPCHandler('campaign:stop', (event: any, campaignId: string) => {
    if (!sendingEngine) throw new Error('SendingEngine not initialized');
    if (!campaignId || typeof campaignId !== 'string') {
      throw new Error('Invalid campaign ID');
    }
    sendingEngine.stopCampaign(campaignId);
    return { stopped: campaignId };
  }));

  ipcMain.handle('log:get', safeIPCHandler('log:get', (event: any, campaignId?: string) => {
    if (!logger) throw new Error('Logger not initialized');
    return logger.getLogs(campaignId);
  }));

  campaignManager.setUpdateCallback((campaigns) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('campaign:updated', campaigns);
    }
  });

  logger.setUpdateCallback((logs) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log:updated', logs);
    }
  });

  ipcMain.handle('log:enhanced:get', safeIPCHandler('log:enhanced:get', (event: any, filters?: LogFilter) => {
    if (!enhancedLogger) throw new Error('Enhanced logger not initialized');
    return enhancedLogger.getLogs(filters);
  }));

  ipcMain.handle('log:enhanced:stats', safeIPCHandler('log:enhanced:stats', () => {
    if (!enhancedLogger) throw new Error('Enhanced logger not initialized');
    return enhancedLogger.getLogStats();
  }));

  ipcMain.handle('log:enhanced:export', safeIPCHandler('log:enhanced:export', (event: any, format: 'json' | 'csv' | 'text', filters?: LogFilter) => {
    if (!enhancedLogger) throw new Error('Enhanced logger not initialized');
    if (!['json', 'csv', 'text'].includes(format)) {
      throw new Error('Invalid export format');
    }
    return enhancedLogger.exportLogs(format, filters);
  }));

  ipcMain.handle('log:enhanced:clear', safeIPCHandler('log:enhanced:clear', (event: any, campaignId?: string) => {
    if (!enhancedLogger) throw new Error('Enhanced logger not initialized');
    enhancedLogger.clearLogs(campaignId);
    return { cleared: true };
  }));

  ipcMain.handle('log:enhanced:cleanup', safeIPCHandler('log:enhanced:cleanup', (event: any, daysToKeep: number) => {
    if (!enhancedLogger) throw new Error('Enhanced logger not initialized');
    if (typeof daysToKeep !== 'number' || daysToKeep < 0) {
      throw new Error('Invalid daysToKeep parameter');
    }
    enhancedLogger.cleanupOldLogs(daysToKeep);
    return { cleaned: true };
  }));

  if (enhancedLogger) {
    enhancedLogger.setUpdateCallback((logs) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('log:enhanced:updated', logs);
      }
    });
  }
}

app.on('ready', async () => {
  enhancedLogger = new LoggerService();
  enhancedLogger.info('Application starting', { component: 'System' });

  try {
    storage = new SessionStorage(app.getPath('userData'));
    sessionManager = new SessionManager(storage, enhancedLogger);

    campaignStorage = new CampaignStorage(app.getPath('userData'));
    campaignManager = new CampaignManager(campaignStorage, enhancedLogger);

    queueStorage = new QueueStorage(app.getPath('userData'));

    logger = new Logger();
    sendingEngine = new SendingEngine(campaignManager, logger, enhancedLogger, queueStorage);

    setupIPC();
    createMainWindow();

    await sessionManager.restoreSessions();

    const sessions = sessionManager.getAllSessions();
    const activeSessions = sessions.filter(s => s.status === 'ACTIVE');
    const deviceWindows = new Map();

    activeSessions.forEach(session => {
      const win = (sessionManager as any).sessions.get(session.id);
      if (win && !win.isDestroyed()) {
        deviceWindows.set(session.id, win);
      }
    });

    if (deviceWindows.size > 0) {
      enhancedLogger.info('Checking for interrupted campaigns to resume', {
        component: 'System',
        availableDevices: deviceWindows.size
      });
      await sendingEngine.resumeInterruptedCampaigns(deviceWindows);
    }

    enhancedLogger.success('Application started successfully', { component: 'System' });
  } catch (error) {
    enhancedLogger.critical('Failed to start application', {
      component: 'System',
      error: error instanceof Error ? error : new Error(String(error))
    });
    throw error;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});

app.on('before-quit', () => {
  if (enhancedLogger) {
    enhancedLogger.info('Application shutting down', { component: 'System' });
  }

  if (sessionManager) {
    sessionManager.cleanup();
  }

  if (enhancedLogger) {
    enhancedLogger.cleanup();
  }
});
