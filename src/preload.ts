import { contextBridge, ipcRenderer } from 'electron';
import { SessionData, Campaign, LogEntry } from './types';

contextBridge.exposeInMainWorld('electronAPI', {
  addSession: () => ipcRenderer.invoke('session:add'),
  deleteSession: (sessionId: string) => ipcRenderer.invoke('session:delete', sessionId),
  openChat: (sessionId: string) => ipcRenderer.invoke('session:open-chat', sessionId),
  refreshSession: (sessionId: string) => ipcRenderer.invoke('session:refresh', sessionId),
  listSessions: () => ipcRenderer.invoke('session:list'),
  onSessionUpdate: (callback: (sessions: SessionData[]) => void) => {
    ipcRenderer.on('session:updated', (event, sessions) => callback(sessions));
  },

  createCampaign: (campaignData: Omit<Campaign, 'id' | 'createdAt' | 'stats' | 'status'>) =>
    ipcRenderer.invoke('campaign:create', campaignData),
  listCampaigns: () => ipcRenderer.invoke('campaign:list'),
  getCampaign: (campaignId: string) => ipcRenderer.invoke('campaign:get', campaignId),
  deleteCampaign: (campaignId: string) => ipcRenderer.invoke('campaign:delete', campaignId),
  startCampaign: (campaignId: string) => ipcRenderer.invoke('campaign:start', campaignId),
  pauseCampaign: (campaignId: string) => ipcRenderer.invoke('campaign:pause', campaignId),
  resumeCampaign: (campaignId: string) => ipcRenderer.invoke('campaign:resume', campaignId),
  stopCampaign: (campaignId: string) => ipcRenderer.invoke('campaign:stop', campaignId),
  onCampaignUpdate: (callback: (campaigns: Campaign[]) => void) => {
    ipcRenderer.on('campaign:updated', (event, campaigns) => callback(campaigns));
  },

  getLogs: (campaignId?: string) => ipcRenderer.invoke('log:get', campaignId),
  onLogUpdate: (callback: (logs: LogEntry[]) => void) => {
    ipcRenderer.on('log:updated', (event, logs) => callback(logs));
  },
});
