import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toast } from '@/components/Toast';
import { eventDispatcher } from '@/utils/event';

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ safeAreaInsets: { top: 0, bottom: 0 } }),
}));

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('runs explicit action only when the user clicks the action button', async () => {
    const run = vi.fn();
    render(<Toast />);

    await act(async () => {
      await eventDispatcher.dispatch('toast', {
        type: 'error',
        message: 'Upload failed',
        timeout: 1000,
        action: { label: 'Retry', run },
      });
    });

    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(run).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(run).not.toHaveBeenCalled();
  });

  it('invokes explicit action on click without using the legacy timeout callback path', async () => {
    const run = vi.fn();
    const callback = vi.fn();
    render(<Toast />);

    await act(async () => {
      await eventDispatcher.dispatch('toast', {
        type: 'error',
        message: 'Download failed',
        timeout: 5000,
        callback,
        action: { label: 'Retry', run },
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(run).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();
  });
});
