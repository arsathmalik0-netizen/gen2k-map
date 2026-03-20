export type SessionStatus = 'LOADING' | 'QR_REQUIRED' | 'ACTIVE';

export interface SessionData {
  id: string;
  status: SessionStatus;
  partitionName: string;
  userDataPath: string;
  createdAt: number;
  lastActive: number;
  isVisible: boolean;
}

export interface SessionMetadata {
  sessions: SessionData[];
  lastUpdated: number;
}

export type CampaignStatus = 'DRAFT' | 'RUNNING' | 'PAUSED' | 'STOPPED' | 'COMPLETED';

export interface MessageVariation {
  placeholder: string;
  variations: string[];
}

export interface Campaign {
  id: string;
  name: string;
  message: string;
  variations: MessageVariation[];
  contacts: string[];
  countryCode: string;
  selectedDevices: string[];
  minDelay: number;
  maxDelay: number;
  status: CampaignStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  stats: CampaignStats;
}

export interface CampaignStats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
}

export interface MessageQueueItem {
  id: string;
  campaignId: string;
  contact: string;
  message: string;
  deviceId: string;
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
  attempts: number;
  lastAttempt?: number;
  error?: string;
}

export interface LogEntry {
  timestamp: number;
  level: 'INFO' | 'SUCCESS' | 'ERROR' | 'WARNING';
  message: string;
  campaignId?: string;
  deviceId?: string;
  contact?: string;
}

export type LogLevel = 'DEBUG' | 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type LogComponent =
  | 'System'
  | 'SessionManager'
  | 'CampaignManager'
  | 'SendingEngine'
  | 'WhatsApp'
  | 'WhatsAppSender'
  | 'Storage'
  | 'CampaignStorage'
  | 'IPC'
  | 'Console'
  | 'LoggerService';

export type ErrorSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface EnhancedLogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  component: LogComponent;
  message: string;
  campaignId?: string;
  deviceId?: string;
  contact?: string;
  correlationId: string;
  error?: {
    name: string;
    message: string;
    stack: string;
    fingerprint: string;
  };
  severity?: ErrorSeverity;
  stackTrace?: string;
  metadata: any;
  systemMetadata: {
    platform: string;
    arch: string;
    nodeVersion: string;
    electronVersion: string;
    chromeVersion: string;
    memoryUsage: any;
    uptime: number;
    pid: number;
  };
}

export interface LogFilter {
  level?: LogLevel;
  component?: LogComponent;
  campaignId?: string;
  deviceId?: string;
  startTime?: number;
  endTime?: number;
  searchText?: string;
}

export interface CampaignMetadata {
  campaigns: Campaign[];
  lastUpdated: number;
}

export interface IPCChannels {
  'session:add': () => void;
  'session:delete': (id: string) => void;
  'session:open-chat': (id: string) => void;
  'session:refresh': (id: string) => void;
  'session:list': () => SessionData[];
  'session:updated': (sessions: SessionData[]) => void;
  'campaign:create': (campaign: Omit<Campaign, 'id' | 'createdAt' | 'stats'>) => void;
  'campaign:list': () => Campaign[];
  'campaign:get': (id: string) => Campaign | null;
  'campaign:delete': (id: string) => void;
  'campaign:start': (id: string) => void;
  'campaign:pause': (id: string) => void;
  'campaign:resume': (id: string) => void;
  'campaign:stop': (id: string) => void;
  'campaign:updated': (campaigns: Campaign[]) => void;
  'log:get': (campaignId?: string) => LogEntry[];
  'log:updated': (logs: LogEntry[]) => void;
  'log:enhanced:get': (filters?: LogFilter) => EnhancedLogEntry[];
  'log:enhanced:updated': (logs: EnhancedLogEntry[]) => void;
  'log:enhanced:stats': () => any;
  'log:enhanced:export': (format: 'json' | 'csv' | 'text', filters?: LogFilter) => string;
  'log:enhanced:clear': (campaignId?: string) => void;
  'log:enhanced:cleanup': (daysToKeep: number) => void;
}
