import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { SessionStorage } from './storage';
import { SessionManager } from './sessionManager';
import { CampaignStorage } from './campaignStorage';
import { CampaignManager } from './campaignManager';
import { SendingEngine } from './sendingEngine';
import { Logger } from './logger';
import { LoggerService } from './loggerService';
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

function setupIPC(): void {
  if (!sessionManager || !campaignManager || !sendingEngine || !logger) return;

  ipcMain.handle('session:add', () => {
    if (sessionManager) {
      const sessionId = sessionManager.createSession();
      return sessionId;
    }
    return null;
  });

  ipcMain.handle('session:delete', (event, sessionId: string) => {
    if (sessionManager) {
      sessionManager.deleteSession(sessionId);
    }
  });

  ipcMain.handle('session:open-chat', (event, sessionId: string) => {
    if (sessionManager) {
      sessionManager.openChatWindow(sessionId);
    }
  });

  ipcMain.handle('session:refresh', (event, sessionId: string) => {
    if (sessionManager) {
      sessionManager.refreshSession(sessionId);
    }
  });

  ipcMain.handle('session:list', () => {
    if (sessionManager) {
      return sessionManager.getAllSessions();
    }
    return [];
  });

  sessionManager.setUpdateCallback((sessions) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('session:updated', sessions);
    }
  });

  ipcMain.handle('campaign:create', (event, campaignData: Omit<Campaign, 'id' | 'createdAt' | 'stats' | 'status'>) => {
    if (campaignManager) {
      const campaignId = campaignManager.createCampaign(campaignData);
      return campaignId;
    }
    return null;
  });

  ipcMain.handle('campaign:list', () => {
    if (campaignManager) {
      return campaignManager.getAllCampaigns();
    }
    return [];
  });

  ipcMain.handle('campaign:get', (event, campaignId: string) => {
    if (campaignManager) {
      return campaignManager.getCampaign(campaignId);
    }
    return null;
  });

  ipcMain.handle('campaign:delete', (event, campaignId: string) => {
    if (campaignManager) {
      campaignManager.deleteCampaign(campaignId);
    }
  });

  ipcMain.handle('campaign:start', async (event, campaignId: string) => {
    if (sendingEngine && sessionManager) {
      const campaign = campaignManager?.getCampaign(campaignId);
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
    }
  });

  ipcMain.handle('campaign:pause', (event, campaignId: string) => {
    if (sendingEngine) {
      sendingEngine.pauseCampaign(campaignId);
    }
  });

  ipcMain.handle('campaign:resume', (event, campaignId: string) => {
    if (sendingEngine && sessionManager) {
      const campaign = campaignManager?.getCampaign(campaignId);
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
    }
  });

  ipcMain.handle('campaign:stop', (event, campaignId: string) => {
    if (sendingEngine) {
      sendingEngine.stopCampaign(campaignId);
    }
  });

  ipcMain.handle('log:get', (event, campaignId?: string) => {
    if (logger) {
      return logger.getLogs(campaignId);
    }
    return [];
  });

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

  ipcMain.handle('log:enhanced:get', (event, filters?: LogFilter) => {
    if (enhancedLogger) {
      return enhancedLogger.getLogs(filters);
    }
    return [];
  });

  ipcMain.handle('log:enhanced:stats', () => {
    if (enhancedLogger) {
      return enhancedLogger.getLogStats();
    }
    return null;
  });

  ipcMain.handle('log:enhanced:export', (event, format: 'json' | 'csv' | 'text', filters?: LogFilter) => {
    if (enhancedLogger) {
      return enhancedLogger.exportLogs(format, filters);
    }
    return '';
  });

  ipcMain.handle('log:enhanced:clear', (event, campaignId?: string) => {
    if (enhancedLogger) {
      enhancedLogger.clearLogs(campaignId);
    }
  });

  ipcMain.handle('log:enhanced:cleanup', (event, daysToKeep: number) => {
    if (enhancedLogger) {
      enhancedLogger.cleanupOldLogs(daysToKeep);
    }
  });

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

    logger = new Logger();
    sendingEngine = new SendingEngine(campaignManager, logger, enhancedLogger);

    setupIPC();
    createMainWindow();

    await sessionManager.restoreSessions();

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
