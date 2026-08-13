import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  saveSysSettings: vi.fn(),
  navigateToLogin: vi.fn(),
  navigateToResetPassword: vi.fn(),
  navigateToUpdatePassword: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn() },
  envConfig: { getAppService: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: mocks.envConfig }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ logout: mocks.logout }),
}));

vi.mock('@/helpers/settings', () => ({
  saveSysSettings: mocks.saveSysSettings,
}));

vi.mock('@/utils/nav', () => ({
  navigateToLogin: mocks.navigateToLogin,
  navigateToResetPassword: mocks.navigateToResetPassword,
  navigateToUpdatePassword: mocks.navigateToUpdatePassword,
}));

vi.mock('@/libs/user', () => ({
  deleteUser: vi.fn(),
}));

import { useUserActions } from '@/hooks/useUserActions';

describe('useUserActions logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.logout.mockResolvedValue(undefined);
    mocks.saveSysSettings.mockResolvedValue(undefined);
  });

  it('waits for credential teardown before navigating to the auth surface', async () => {
    let finishLogout!: () => void;
    mocks.logout.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishLogout = resolve;
        }),
    );
    const { result } = renderHook(() => useUserActions());

    let logoutPromise!: Promise<void>;
    act(() => {
      logoutPromise = result.current.handleLogout();
    });

    expect(mocks.navigateToLogin).not.toHaveBeenCalled();
    finishLogout();
    await act(() => logoutPromise);

    expect(mocks.saveSysSettings).toHaveBeenCalledWith(mocks.envConfig, 'keepLogin', false);
    expect(mocks.navigateToLogin).toHaveBeenCalledWith(mocks.router);
  });
});
