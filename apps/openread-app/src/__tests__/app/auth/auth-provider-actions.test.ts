import { describe, expect, it, vi } from 'vitest';

import {
  buildAuthProviderActions,
  shouldShowAppleAuthProvider,
} from '@/app/auth/auth-provider-actions';

const translate = (key: string, values?: Record<string, string>) =>
  key.replace('{{provider}}', values?.['provider'] ?? '');

describe('auth provider actions', () => {
  it('keeps web launch auth Google-only', () => {
    const providers = buildAuthProviderActions({
      isNativeIOSApp: false,
      isTauriPlatform: false,
      onApple: vi.fn(),
      onGoogle: vi.fn(),
      translate,
    });

    expect(providers.map((provider) => provider.id)).toEqual(['google']);
    expect(providers[0]?.label).toBe('Continue with Google');
  });

  it('keeps non-iOS Tauri auth Google-only', () => {
    expect(shouldShowAppleAuthProvider({ isNativeIOSApp: false, isTauriPlatform: true })).toBe(
      false,
    );

    const providers = buildAuthProviderActions({
      isNativeIOSApp: false,
      isTauriPlatform: true,
      onApple: vi.fn(),
      onGoogle: vi.fn(),
      translate,
    });

    expect(providers.map((provider) => provider.id)).toEqual(['google']);
  });

  it('shows Apple only for native iOS/iPadOS Tauri auth compliance', () => {
    expect(shouldShowAppleAuthProvider({ isNativeIOSApp: true, isTauriPlatform: true })).toBe(true);

    const providers = buildAuthProviderActions({
      isNativeIOSApp: true,
      isTauriPlatform: true,
      onApple: vi.fn(),
      onGoogle: vi.fn(),
      translate,
    });

    expect(providers.map((provider) => provider.id)).toEqual(['google', 'apple']);
    expect(providers[1]?.label).toBe('Continue with Apple');
  });

  it('uses the latest rebuilt provider callback instead of a stale OAuth closure', () => {
    const staleGoogle = vi.fn();
    const currentGoogle = vi.fn();

    buildAuthProviderActions({
      isNativeIOSApp: false,
      isTauriPlatform: true,
      onApple: vi.fn(),
      onGoogle: staleGoogle,
      translate,
    });

    const currentProviders = buildAuthProviderActions({
      isNativeIOSApp: false,
      isTauriPlatform: true,
      onApple: vi.fn(),
      onGoogle: currentGoogle,
      translate,
    });

    currentProviders[0]?.onClick();

    expect(staleGoogle).not.toHaveBeenCalled();
    expect(currentGoogle).toHaveBeenCalledTimes(1);
  });
});
