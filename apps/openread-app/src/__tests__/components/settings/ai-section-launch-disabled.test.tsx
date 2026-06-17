import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/launchFeatures', async () => {
  const actual = await vi.importActual<typeof import('@/services/launchFeatures')>(
    '@/services/launchFeatures',
  );
  return {
    ...actual,
    LAUNCH_BYOK_ENABLED: false,
  };
});

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {} }),
}));

vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    token: 'reader-token',
    user: { id: 'reader-user' },
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@/hooks/useQuotaStats', () => ({
  useQuotaStats: () => ({ quotas: [], userProfilePlan: 'reader' }),
}));

vi.mock('@/hooks/useTierConfig', async () => {
  const { getFallbackConfig } =
    await vi.importActual<typeof import('@/lib/tier-defaults')>('@/lib/tier-defaults');
  return {
    useTierConfig: () => ({ config: getFallbackConfig(), isLoading: false, error: null }),
  };
});

vi.mock('@/store/settingsStore', () => {
  const mockState = {
    settings: {
      aiSettings: {
        enabled: true,
        provider: 'groq',
        ollamaBaseUrl: 'http://127.0.0.1:11434',
        ollamaModel: 'llama3.2',
        ollamaEmbeddingModel: 'nomic-embed-text',
        spoilerProtection: true,
      },
    },
    setSettings: vi.fn(),
    saveSettings: vi.fn(),
  };

  const fn = vi.fn(() => mockState) as unknown as {
    (): typeof mockState;
    getState: () => typeof mockState;
    setState: (partial: Partial<typeof mockState>) => void;
    subscribe: (listener: () => void) => () => void;
    destroy: () => void;
  };
  fn.getState = () => mockState;
  fn.setState = vi.fn();
  fn.subscribe = vi.fn();
  fn.destroy = vi.fn();

  return { useSettingsStore: fn };
});

vi.mock('@/hooks/useProviderKeys', () => ({
  useProviderKeys: () => ({
    keys: [],
    isLoading: false,
    error: null,
    addKey: vi.fn(),
    removeKey: vi.fn(),
    testKey: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@/services/environment', () => ({
  isMobilePlatform: () => false,
  isOfflineAiSupportedPlatform: () => true,
  getAPIBaseUrl: () => 'http://localhost:3000/api',
}));

vi.mock('@/utils/access', () => ({
  getAccessToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: { dispatch: vi.fn() },
}));

vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('not available')));

import { AiSection } from '@/components/settings/ai-section';

describe('AiSection BYOK launch holdback', () => {
  afterEach(() => cleanup());

  it('hides BYOK setup UI even for BYOK-capable plans', () => {
    render(<AiSection />);

    expect(screen.queryByText('Bring Your Own Key')).toBeNull();
    expect(screen.queryByText('Reader+')).toBeNull();
    expect(screen.queryByText('Provider')).toBeNull();
    expect(screen.queryByText('Test Connection')).toBeNull();
  });
});
