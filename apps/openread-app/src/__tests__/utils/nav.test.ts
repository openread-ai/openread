import { describe, expect, it, vi } from 'vitest';
import { navigateToReader } from '@/utils/nav';

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }));
vi.mock('@tauri-apps/api/webviewWindow', () => ({ WebviewWindow: vi.fn() }));
vi.mock('@/services/environment', () => ({
  isPWA: () => false,
  isWebAppPlatform: () => true,
}));

const LOCAL_HASH = 'd41d8cd98f00b204e9800998ecf8427e';
const DB_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('navigateToReader identity validation', () => {
  it('navigates only with canonical OpenRead book refs', () => {
    const router = { push: vi.fn(), replace: vi.fn() };

    navigateToReader(router as never, [LOCAL_HASH], 'foo=bar');

    expect(router.push).toHaveBeenCalledWith(`/reader/${LOCAL_HASH}?foo=bar`, undefined);
  });

  it('rejects plain DB UUID reader navigation', () => {
    const router = { push: vi.fn(), replace: vi.fn() };

    navigateToReader(router as never, [DB_UUID]);

    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('rejects placeholder reader navigation', () => {
    const router = { push: vi.fn(), replace: vi.fn() };

    navigateToReader(router as never, ['_placeholder']);

    expect(router.push).not.toHaveBeenCalled();
  });
});
