import { describe, expect, it, vi } from 'vitest';

import { runAccountLibraryMutation } from '@/services/accountLibraryLifecycle';

describe('account library mutation serialization', () => {
  it('does not start a later account transition boundary until the active mutation releases it', async () => {
    let releaseFirst!: () => void;
    const first = runAccountLibraryMutation(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    const secondStarted = vi.fn();
    const second = runAccountLibraryMutation(async () => {
      secondStarted();
    });

    await Promise.resolve();
    expect(secondStarted).not.toHaveBeenCalled();

    releaseFirst();
    await Promise.all([first, second]);
    expect(secondStarted).toHaveBeenCalledTimes(1);
  });

  it('releases the account boundary when a mutation fails', async () => {
    await expect(
      runAccountLibraryMutation(async () => {
        throw new Error('persistence failed');
      }),
    ).rejects.toThrow('persistence failed');

    const nextMutation = vi.fn();
    await runAccountLibraryMutation(async () => {
      nextMutation();
    });
    expect(nextMutation).toHaveBeenCalledTimes(1);
  });
});
