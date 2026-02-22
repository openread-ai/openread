/**
 * Unified Logger
 *
 * Environment-aware logging utility that works across browser, server, and Tauri.
 * Uses console-based output with level gating controlled by NEXT_PUBLIC_LOG_LEVEL.
 *
 * Usage:
 *   import { logger } from '@/utils/logger';
 *   logger.info('Application started');
 *
 *   import { createLogger } from '@/utils/logger';
 *   const log = createLogger('sync');
 *   log.warn('Retry attempt', { attempt: 3 });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  try {
    const env = (typeof process !== 'undefined' && process.env?.['NEXT_PUBLIC_LOG_LEVEL']) || '';
    const level = env.toLowerCase() as LogLevel;
    if (level in LEVELS) return level;
  } catch {
    // process may not exist in some browser contexts
  }

  // Default: info in production, debug in development
  try {
    if (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'production') {
      return 'info';
    }
  } catch {
    // ignore
  }
  return 'debug';
}

const configuredLevel = getConfiguredLevel();
const minLevel = LEVELS[configuredLevel];

export interface Logger {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

function formatArgs(prefix: string, message: string, data?: unknown): unknown[] {
  if (data !== undefined) {
    return [`${prefix} ${message}`, data];
  }
  return [`${prefix} ${message}`];
}

function makeLogger(module?: string): Logger {
  const prefix = module ? `[${module}]` : '';

  return {
    debug(message: string, data?: unknown) {
      if (LEVELS.debug < minLevel) return;
      console.debug(...formatArgs(prefix, message, data));
    },
    info(message: string, data?: unknown) {
      if (LEVELS.info < minLevel) return;
      console.log(...formatArgs(prefix, message, data));
    },
    warn(message: string, data?: unknown) {
      if (LEVELS.warn < minLevel) return;
      console.warn(...formatArgs(prefix, message, data));
    },
    error(message: string, data?: unknown) {
      if (LEVELS.error < minLevel) return;
      console.error(...formatArgs(prefix, message, data));
    },
  };
}

/** Root logger instance (no module prefix). */
export const logger: Logger = makeLogger();

/**
 * Create a module-scoped logger.
 *
 * @param module - Module name shown as prefix, e.g. 'sync', 'auth'
 */
export function createLogger(module: string): Logger {
  return makeLogger(module);
}
