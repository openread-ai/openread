import { afterEach, describe, expect, it, vi } from 'vitest';

describe('app launch feature adapter', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_OPENREAD_MCP_ENABLED;
    delete process.env.OPENREAD_ENABLE_BYOK_IN_TESTS;
    vi.resetModules();
  });

  it('derives held registry defaults when overrides are unset', async () => {
    delete process.env.OPENREAD_ENABLE_BYOK_IN_TESTS;
    vi.resetModules();

    const {
      getLaunchFeatureOverrides,
      LAUNCH_BYOK_ENABLED,
      LAUNCH_TRANSLATION_ENABLED,
      LAUNCH_TTS_ENABLED,
    } = await import('@/services/launchFeatures');

    expect(getLaunchFeatureOverrides()).toEqual({});
    expect(LAUNCH_BYOK_ENABLED).toBe(false);
    expect(LAUNCH_TRANSLATION_ENABLED).toBe(false);
    expect(LAUNCH_TTS_ENABLED).toBe(false);
  });

  it('transports an explicit BYOK test override into the registry adapter', async () => {
    process.env.OPENREAD_ENABLE_BYOK_IN_TESTS = '1';
    vi.resetModules();

    const { getLaunchFeatureOverrides, LAUNCH_BYOK_ENABLED } =
      await import('@/services/launchFeatures');

    expect(getLaunchFeatureOverrides()).toEqual({ byok: true });
    expect(LAUNCH_BYOK_ENABLED).toBe(true);
  });

  it('parses explicit true, false, and unset override values', async () => {
    const { resolveLaunchFeatureOverrides } = await import('@/services/launchFeatures');

    expect(resolveLaunchFeatureOverrides({})).toEqual({});
    expect(resolveLaunchFeatureOverrides({ OPENREAD_ENABLE_BYOK_IN_TESTS: '1' })).toEqual({
      byok: true,
    });
    expect(resolveLaunchFeatureOverrides({ OPENREAD_ENABLE_BYOK_IN_TESTS: '0' })).toEqual({
      byok: false,
    });
  });

  it('keeps MCP default-off', async () => {
    delete process.env.NEXT_PUBLIC_OPENREAD_MCP_ENABLED;
    vi.resetModules();
    const { LAUNCH_MCP_ENABLED } = await import('@/services/launchFeatures');
    expect(LAUNCH_MCP_ENABLED).toBe(false);
  });

  it('keeps the production-capable MCP public flag unchanged', async () => {
    process.env.NEXT_PUBLIC_OPENREAD_MCP_ENABLED = '1';
    vi.resetModules();
    const { LAUNCH_MCP_ENABLED } = await import('@/services/launchFeatures');
    expect(LAUNCH_MCP_ENABLED).toBe(true);
  });
});
