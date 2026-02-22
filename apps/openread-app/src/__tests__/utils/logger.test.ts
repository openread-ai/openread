import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to re-import the module for each test to pick up env changes,
// so we use dynamic imports and resetModules.
describe('logger', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function importLogger() {
    return await import('@/utils/logger');
  }

  describe('level gating', () => {
    it('should suppress debug when LOG_LEVEL=info', async () => {
      process.env['NEXT_PUBLIC_LOG_LEVEL'] = 'info';
      const { logger } = await importLogger();
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      logger.debug('should not appear');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should allow warn when LOG_LEVEL=info', async () => {
      process.env['NEXT_PUBLIC_LOG_LEVEL'] = 'info';
      const { logger } = await importLogger();
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      logger.warn('should appear');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should allow all levels when LOG_LEVEL=debug', async () => {
      process.env['NEXT_PUBLIC_LOG_LEVEL'] = 'debug';
      const { logger } = await importLogger();

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');

      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('should only allow error when LOG_LEVEL=error', async () => {
      process.env['NEXT_PUBLIC_LOG_LEVEL'] = 'error';
      const { logger } = await importLogger();

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');

      expect(debugSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('module scoping', () => {
    it('should prefix messages with module name', async () => {
      process.env['NEXT_PUBLIC_LOG_LEVEL'] = 'debug';
      const { createLogger } = await importLogger();
      const log = createLogger('sync');
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      log.info('connected');
      expect(spy).toHaveBeenCalledWith('[sync] connected');
    });

    it('should pass data as second argument', async () => {
      process.env['NEXT_PUBLIC_LOG_LEVEL'] = 'debug';
      const { createLogger } = await importLogger();
      const log = createLogger('auth');
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      log.warn('token expired', { userId: '123' });
      expect(spy).toHaveBeenCalledWith('[auth] token expired', { userId: '123' });
    });

    it('root logger should have no prefix', async () => {
      process.env['NEXT_PUBLIC_LOG_LEVEL'] = 'debug';
      const { logger } = await importLogger();
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('hello');
      expect(spy).toHaveBeenCalledWith(' hello');
    });
  });

  describe('default level', () => {
    it('should default to debug in non-production', async () => {
      delete process.env['NEXT_PUBLIC_LOG_LEVEL'];
      (process.env as Record<string, string>)['NODE_ENV'] = 'development';
      const { logger } = await importLogger();
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      logger.debug('test');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should default to info in production', async () => {
      delete process.env['NEXT_PUBLIC_LOG_LEVEL'];
      (process.env as Record<string, string>)['NODE_ENV'] = 'production';
      const { logger } = await importLogger();
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      logger.debug('test');
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
