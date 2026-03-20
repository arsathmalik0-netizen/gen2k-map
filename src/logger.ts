import { LogEntry } from './types';

export class Logger {
  private logs: LogEntry[] = [];
  private updateCallback?: (logs: LogEntry[]) => void;

  setUpdateCallback(callback: (logs: LogEntry[]) => void): void {
    this.updateCallback = callback;
  }

  private notifyUpdate(): void {
    if (this.updateCallback) {
      this.updateCallback([...this.logs]);
    }
  }

  log(
    level: LogEntry['level'],
    message: string,
    options?: { campaignId?: string; deviceId?: string; contact?: string }
  ): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      ...options,
    };

    this.logs.push(entry);
    console.log(`[${level}] ${message}`);

    this.notifyUpdate();
  }

  info(message: string, options?: { campaignId?: string; deviceId?: string; contact?: string }): void {
    this.log('INFO', message, options);
  }

  success(message: string, options?: { campaignId?: string; deviceId?: string; contact?: string }): void {
    this.log('SUCCESS', message, options);
  }

  error(message: string, options?: { campaignId?: string; deviceId?: string; contact?: string }): void {
    this.log('ERROR', message, options);
  }

  warning(message: string, options?: { campaignId?: string; deviceId?: string; contact?: string }): void {
    this.log('WARNING', message, options);
  }

  getLogs(campaignId?: string): LogEntry[] {
    if (campaignId) {
      return this.logs.filter(log => log.campaignId === campaignId);
    }
    return [...this.logs];
  }

  clearLogs(campaignId?: string): void {
    if (campaignId) {
      this.logs = this.logs.filter(log => log.campaignId !== campaignId);
    } else {
      this.logs = [];
    }
    this.notifyUpdate();
  }
}
