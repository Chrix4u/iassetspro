// ============================================================================
// STRUCTURED LOGGER — levels, context, performance tracking
// ============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  userId?: string;
  requestId?: string;
  duration?: number;
  data?: Record<string, unknown>;
  error?: { message: string; stack?: string; code?: string };
}

class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      data,
    };
    // In production, send to structured log aggregation service
    // For now, use console with proper formatting
    const method = level === 'debug' ? 'debug' : level === 'fatal' ? 'error' : level;
    console[method](`[${entry.timestamp}] [${level.toUpperCase()}] [${this.context}] ${message}`, data ?? '');
  }

  debug(message: string, data?: Record<string, unknown>) {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>) {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.log('warn', message, data);
  }

  error(
    message: string,
    error?: Error | Record<string, unknown>,
    data?: Record<string, unknown>,
  ) {
    const errData = error instanceof Error
      ? { message: error.message, stack: error.stack, code: (error as unknown as Record<string, unknown>).code }
      : error;

    if (data) {
      this.log('error', message, {
        ...data,
        ...(errData ? { error: errData } : {}),
      });
      return;
    }

    this.log('error', message, errData as Record<string, unknown> | undefined);
  }

  fatal(message: string, error?: Error) {
    this.log('fatal', message, error ? { message: error.message, stack: error.stack } : undefined);
  }

  // Performance timer — returns an object with an `end()` method
  timer(label: string) {
    const start = performance.now();
    return {
      end: () => {
        const duration = Math.round(performance.now() - start);
        this.info(`${label} completed`, { durationMs: duration });
        return duration;
      },
    };
  }
}

export function createLogger(context: string) {
  return new Logger(context);
}
