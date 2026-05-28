/**
 * Logger
 * 
 * Structured logging service for consistent log formatting and levels.
 * Supports different log levels: DEBUG, INFO, WARN, ERROR
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogContext {
  userId?: string;
  requestId?: string;
  databaseId?: string;
  [key: string]: any;
}

class Logger {
  private minLevel: LogLevel = LogLevel.INFO;
  private isDevelopment = process.env.NODE_ENV !== 'production';

  constructor() {
    if (process.env.LOG_LEVEL) {
      this.minLevel = LogLevel[process.env.LOG_LEVEL as keyof typeof LogLevel] || LogLevel.INFO;
    }
  }

  private formatLog(level: LogLevel, message: string, context?: LogContext, error?: Error): string {
    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
    const errorStr = error ? `\n${error.stack}` : '';
    return `[${timestamp}] [${levelName}]${contextStr} ${message}${errorStr}`;
  }

  debug(message: string, context?: LogContext) {
    if (this.minLevel <= LogLevel.DEBUG) {
      console.debug(this.formatLog(LogLevel.DEBUG, message, context));
    }
  }

  info(message: string, context?: LogContext) {
    if (this.minLevel <= LogLevel.INFO) {
      console.log(this.formatLog(LogLevel.INFO, message, context));
    }
  }

  warn(message: string, context?: LogContext, error?: Error) {
    if (this.minLevel <= LogLevel.WARN) {
      console.warn(this.formatLog(LogLevel.WARN, message, context, error));
    }
  }

  error(message: string, context?: LogContext, error?: Error) {
    if (this.minLevel <= LogLevel.ERROR) {
      console.error(this.formatLog(LogLevel.ERROR, message, context, error));
    }
  }
}

export const logger = new Logger();
