import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const NORMALIZED_DOT_HOSTILE_REDIRECT = '/..//attacker.com';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  installSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/services/auth/clientAuth', () => ({
  clientAuth: { installSession: mocks.installSession },
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

import AuthCallback from '@/app/auth/callback/page';

describe('AuthCallback redirects', () => {
  beforeEach(() => {
    mocks.installSession.mockResolvedValue({ user: { id: 'user-1' } });
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
    vi.clearAllMocks();
  });

  it.each([
    ['rejects an absolute hostile target', 'https://attacker.example/path', '/home'],
    ['rejects a normalized-dot hostile target', NORMALIZED_DOT_HOSTILE_REDIRECT, '/home'],
    ['accepts an internal target', '/library?sort=recent#saved', '/library?sort=recent#saved'],
  ])('%s', async (_name, target, expected) => {
    window.location.hash = new URLSearchParams({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      next: target,
    }).toString();

    render(<AuthCallback />);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(expected));
  });
});
