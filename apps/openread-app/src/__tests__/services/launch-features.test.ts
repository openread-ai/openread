import { afterEach, describe, expect, it, vi } from 'vitest';

describe('MCP client feature contract', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_OPENREAD_MCP_ENABLED;
    vi.resetModules();
  });

  it('is default-off', async () => {
    delete process.env.NEXT_PUBLIC_OPENREAD_MCP_ENABLED;
    vi.resetModules();
    const { LAUNCH_MCP_ENABLED } = await import('@/services/launchFeatures');
    expect(LAUNCH_MCP_ENABLED).toBe(false);
  });

  it('enables client exposure only through the production-capable public flag', async () => {
    process.env.NEXT_PUBLIC_OPENREAD_MCP_ENABLED = '1';
    vi.resetModules();
    const { LAUNCH_MCP_ENABLED } = await import('@/services/launchFeatures');
    expect(LAUNCH_MCP_ENABLED).toBe(true);
  });
});
