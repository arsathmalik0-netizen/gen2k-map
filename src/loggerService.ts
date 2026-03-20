import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { EnhancedLogEntry, LogLevel, LogComponent, ErrorSeverity } from './types';

export class LoggerService {
  private logs: EnhancedLogEntry[] = [];
  private updateCallback?: (logs: EnhancedLogEntry[]) => void;
  private logFilePath: string;
  private errorLogPath: string;
  private maxLogsInMemory = 10000;
  private batchSize = 50;
  private logBatch: EnhancedLogEntry[] = [];
  private flushTimer?: NodeJS.Timeout;
  private logDir: string;
  private maxLogFileSize = 10 * 1024 * 1024;
  private maxLogFiles = 5;
  private consoleBuffer: Array<{ type: string; args: any[] }> = [];
  private originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info
  };
  private isLogging = false;

  constructor() {
    this.logDir = path.join(app.getPath('userData'), 'logs');
    this.ensureLogDirectory();

    this.logFilePath = path.join(this.logDir, 'application.log');
    this.errorLogPath = path.join(this.logDir, 'errors.log');

    this.loadRecentLogs();
    this.setupGlobalErrorHandlers();
    this.interceptConsole();
    this.startFlushTimer();
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private setupGlobalErrorHandlers(): void {
    process.on('uncaughtException', (error: Error) => {
      this.critical('Uncaught Exception', {
        component: 'System',
        error,
        metadata: { type: 'uncaughtException' }
      });
    });

    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      this.critical('Unhandled Promise Rejection', {
        component: 'System',
        error: reason instanceof Error ? reason : new Error(String(reason)),
        metadata: { type: 'unhandledRejection', promise: String(promise) }
      });
    });
  }

  private interceptConsole(): void {
    const { log, error, warn, info } = this.originalConsole;

    console.log = (...args: any[]) => {
      log.apply(console, args);
      if (!this.isLogging) this.captureConsoleOutput('log', args);
    };

    console.error = (...args: any[]) => {
      error.apply(console, args);
      if (!this.isLogging) this.captureConsoleOutput('error', args);
    };

    console.warn = (...args: any[]) => {
      warn.apply(console, args);
      if (!this.isLogging) this.captureConsoleOutput('warn', args);
    };

    console.info = (...args: any[]) => {
      info.apply(console, args);
      if (!this.isLogging) this.captureConsoleOutput('info', args);
    };
  }

  private captureConsoleOutput(type: string, args: any[]): void {
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    const level: LogLevel = type === 'error' ? 'ERROR' :
                            type === 'warn' ? 'WARNING' : 'DEBUG';

    this.log(level, message, {
      component: 'Console',
      metadata: { consoleType: type }
    });
  }

  private loadRecentLogs(): void {
    try {
      if (fs.existsSync(this.logFilePath)) {
        const content = fs.readFileSync(this.logFilePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        const recentLines = lines.slice(-this.maxLogsInMemory);

        this.logs = recentLines.map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        }).filter(Boolean) as EnhancedLogEntry[];
      }
    } catch (error) {
      console.error('Failed to load recent logs:', error);
    }
  }

  setUpdateCallback(callback: (logs: EnhancedLogEntry[]) => void): void {
    this.updateCallback = callback;
  }

  private notifyUpdate(): void {
    if (this.updateCallback) {
      this.updateCallback([...this.logs]);
    }
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private captureStackTrace(): string {
    const stack = new Error().stack || '';
    const lines = stack.split('\n').slice(3);
    return lines.join('\n');
  }

  private getSystemMetadata(): any {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      pid: process.pid
    };
  }

  private generateErrorFingerprint(error: Error, component: LogComponent): string {
    const stack = error.stack || error.message;
    const firstLine = stack.split('\n')[0];
    return `${component}:${error.name}:${firstLine}`.replace(/\s+/g, '-');
  }

  private classifyErrorSeverity(error: Error): ErrorSeverity {
    const criticalPatterns = ['ENOSPC', 'ENOMEM', 'Fatal', 'Cannot read property'];
    const message = error.message || '';

    if (criticalPatterns.some(pattern => message.includes(pattern))) {
      return 'CRITICAL';
    }

    if (error.name === 'TypeError' || error.name === 'ReferenceError') {
      return 'HIGH';
    }

    return 'MEDIUM';
  }

  private log(
    level: LogLevel,
    message: string,
    options?: {
      component?: LogComponent;
      campaignId?: string;
      deviceId?: string;
      contact?: string;
      error?: Error;
      metadata?: any;
      correlationId?: string;
      skipConsole?: boolean;
    }
  ): void {
    if (this.isLogging) return;
    this.isLogging = true;

    try {
      const entry: EnhancedLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      level,
      component: options?.component || 'System',
      message,
      campaignId: options?.campaignId,
      deviceId: options?.deviceId,
      contact: options?.contact,
      correlationId: options?.correlationId || this.generateCorrelationId(),
      metadata: options?.metadata || {},
      systemMetadata: this.getSystemMetadata(),
    };

    if (options?.error) {
      entry.error = {
        name: options.error.name,
        message: options.error.message,
        stack: options.error.stack || '',
        fingerprint: this.generateErrorFingerprint(options.error, entry.component)
      };
      entry.severity = this.classifyErrorSeverity(options.error);
    }

    if (level === 'ERROR' || level === 'CRITICAL') {
      entry.stackTrace = this.captureStackTrace();
    }

    this.logs.push(entry);
    if (this.logs.length > this.maxLogsInMemory) {
      this.logs.shift();
    }

    this.logBatch.push(entry);
    if (this.logBatch.length >= this.batchSize) {
      this.flushLogs();
    }

    if (!options?.skipConsole) {
      this.outputToConsole(entry);
    }

    this.notifyUpdate();
    } finally {
      this.isLogging = false;
    }
  }

  private outputToConsole(entry: EnhancedLogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const prefix = `[${timestamp}] [${entry.level}] [${entry.component}]`;
    const message = `${prefix} ${entry.message}`;

    switch (entry.level) {
      case 'CRITICAL':
      case 'ERROR':
        this.originalConsole.error(message);
        if (entry.error) {
          this.originalConsole.error('Error Details:', entry.error);
        }
        break;
      case 'WARNING':
        this.originalConsole.warn(message);
        break;
      case 'INFO':
      case 'SUCCESS':
        this.originalConsole.info(message);
        break;
      default:
        this.originalConsole.log(message);
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.logBatch.length > 0) {
        this.flushLogs();
      }
    }, 5000);
  }

  private flushLogs(): void {
    if (this.logBatch.length === 0) return;

    try {
      const logsToWrite = [...this.logBatch];
      this.logBatch = [];

      this.rotateLogFileIfNeeded(this.logFilePath);

      const logLines = logsToWrite.map(log => JSON.stringify(log)).join('\n') + '\n';
      fs.appendFileSync(this.logFilePath, logLines);

      const errorLogs = logsToWrite.filter(log =>
        log.level === 'ERROR' || log.level === 'CRITICAL'
      );

      if (errorLogs.length > 0) {
        this.rotateLogFileIfNeeded(this.errorLogPath);
        const errorLines = errorLogs.map(log => JSON.stringify(log)).join('\n') + '\n';
        fs.appendFileSync(this.errorLogPath, errorLines);
      }
    } catch (error) {
      console.error('Failed to flush logs:', error);
    }
  }

  private rotateLogFileIfNeeded(filePath: string): void {
    try {
      if (!fs.existsSync(filePath)) return;

      const stats = fs.statSync(filePath);
      if (stats.size < this.maxLogFileSize) return;

      const ext = path.extname(filePath);
      const base = path.basename(filePath, ext);
      const dir = path.dirname(filePath);

      for (let i = this.maxLogFiles - 1; i > 0; i--) {
        const oldPath = path.join(dir, `${base}.${i}${ext}`);
        const newPath = path.join(dir, `${base}.${i + 1}${ext}`);

        if (fs.existsSync(oldPath)) {
          if (i === this.maxLogFiles - 1) {
            fs.unlinkSync(oldPath);
          } else {
            fs.renameSync(oldPath, newPath);
          }
        }
      }

      const archivePath = path.join(dir, `${base}.1${ext}`);
      fs.renameSync(filePath, archivePath);
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  debug(message: string, options?: Omit<Parameters<typeof this.log>[2], 'level'>): void {
    this.log('DEBUG', message, options);
  }

  info(message: string, options?: Omit<Parameters<typeof this.log>[2], 'level'>): void {
    this.log('INFO', message, options);
  }

  success(message: string, options?: Omit<Parameters<typeof this.log>[2], 'level'>): void {
    this.log('SUCCESS', message, options);
  }

  warning(message: string, options?: Omit<Parameters<typeof this.log>[2], 'level'>): void {
    this.log('WARNING', message, options);
  }

  error(message: string, options?: Omit<Parameters<typeof this.log>[2], 'level'>): void {
    this.log('ERROR', message, options);
  }

  critical(message: string, options?: Omit<Parameters<typeof this.log>[2], 'level'>): void {
    this.log('CRITICAL', message, options);
  }

  getLogs(filters?: {
    level?: LogLevel;
    component?: LogComponent;
    campaignId?: string;
    deviceId?: string;
    startTime?: number;
    endTime?: number;
    searchText?: string;
  }): EnhancedLogEntry[] {
    let filtered = [...this.logs];

    if (filters) {
      if (filters.level) {
        filtered = filtered.filter(log => log.level === filters.level);
      }
      if (filters.component) {
        filtered = filtered.filter(log => log.component === filters.component);
      }
      if (filters.campaignId) {
        filtered = filtered.filter(log => log.campaignId === filters.campaignId);
      }
      if (filters.deviceId) {
        filtered = filtered.filter(log => log.deviceId === filters.deviceId);
      }
      if (filters.startTime) {
        filtered = filtered.filter(log => log.timestamp >= filters.startTime!);
      }
      if (filters.endTime) {
        filtered = filtered.filter(log => log.timestamp <= filters.endTime!);
      }
      if (filters.searchText) {
        const search = filters.searchText.toLowerCase();
        filtered = filtered.filter(log =>
          log.message.toLowerCase().includes(search) ||
          (log.error?.message || '').toLowerCase().includes(search)
        );
      }
    }

    return filtered;
  }

  getLogStats(): {
    total: number;
    byLevel: Record<LogLevel, number>;
    byComponent: Record<LogComponent, number>;
    errorRate: number;
    criticalCount: number;
  } {
    const stats = {
      total: this.logs.length,
      byLevel: {} as Record<LogLevel, number>,
      byComponent: {} as Record<LogComponent, number>,
      errorRate: 0,
      criticalCount: 0
    };

    this.logs.forEach(log => {
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
      stats.byComponent[log.component] = (stats.byComponent[log.component] || 0) + 1;

      if (log.level === 'CRITICAL') {
        stats.criticalCount++;
      }
    });

    const errorCount = (stats.byLevel['ERROR'] || 0) + (stats.byLevel['CRITICAL'] || 0);
    stats.errorRate = stats.total > 0 ? (errorCount / stats.total) * 100 : 0;

    return stats;
  }

  exportLogs(format: 'json' | 'csv' | 'text', filters?: Parameters<typeof this.getLogs>[0]): string {
    const logs = this.getLogs(filters);

    switch (format) {
      case 'json':
        return JSON.stringify(logs, null, 2);

      case 'csv':
        const headers = 'Timestamp,Level,Component,Message,Campaign ID,Device ID,Error\n';
        const rows = logs.map(log => {
          const timestamp = new Date(log.timestamp).toISOString();
          const error = log.error ? `"${log.error.message.replace(/"/g, '""')}"` : '';
          return `"${timestamp}","${log.level}","${log.component}","${log.message.replace(/"/g, '""')}","${log.campaignId || ''}","${log.deviceId || ''}",${error}`;
        }).join('\n');
        return headers + rows;

      case 'text':
        return logs.map(log => {
          const timestamp = new Date(log.timestamp).toISOString();
          let line = `[${timestamp}] [${log.level}] [${log.component}] ${log.message}`;
          if (log.campaignId) line += ` (Campaign: ${log.campaignId})`;
          if (log.deviceId) line += ` (Device: ${log.deviceId})`;
          if (log.error) line += `\n  Error: ${log.error.message}\n  Stack: ${log.error.stack}`;
          return line;
        }).join('\n\n');

      default:
        return '';
    }
  }

  clearLogs(campaignId?: string): void {
    if (campaignId) {
      this.logs = this.logs.filter(log => log.campaignId !== campaignId);
    } else {
      this.logs = [];
    }
    this.notifyUpdate();
  }

  cleanup(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushLogs();
  }

  cleanupOldLogs(daysToKeep: number = 7): void {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

    try {
      const files = fs.readdirSync(this.logDir);
      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtimeMs < cutoffTime) {
          fs.unlinkSync(filePath);
          this.info(`Deleted old log file: ${file}`, { component: 'LoggerService' });
        }
      });
    } catch (error) {
      this.error('Failed to cleanup old logs', {
        component: 'LoggerService',
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }
}
