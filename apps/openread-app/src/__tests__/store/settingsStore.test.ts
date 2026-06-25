import { beforeEach, describe, expect, it } from 'vitest';
import { createReaderBookKey } from '@openread/types';
import { useSettingsStore } from '@/store/settingsStore';

const LOCAL_HASH = 'd41d8cd98f00b204e9800998ecf8427e';

describe('settingsStore reader-scoped dialog identity', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settingsDialogBookKey: null,
      isSettingsDialogOpen: false,
      isSettingsGlobal: true,
      activeSettingsItemId: null,
    });
  });

  it('never initializes settings dialog book key with an empty string', () => {
    expect(useSettingsStore.getState().settingsDialogBookKey).toBeNull();
  });

  it('does not open book-scoped settings without a valid active book key', () => {
    useSettingsStore.getState().setSettingsDialogOpen(true);
    expect(useSettingsStore.getState().isSettingsDialogOpen).toBe(false);

    useSettingsStore.getState().setSettingsDialogBookKey('');
    useSettingsStore.getState().setSettingsDialogOpen(true);
    expect(useSettingsStore.getState().settingsDialogBookKey).toBeNull();
    expect(useSettingsStore.getState().isSettingsDialogOpen).toBe(false);
  });

  it('opens settings when a valid reader key is active', () => {
    const bookKey = createReaderBookKey(LOCAL_HASH, 'session-a');
    useSettingsStore.getState().setSettingsDialogBookKey(bookKey);
    useSettingsStore.getState().setSettingsDialogOpen(true);

    expect(useSettingsStore.getState().settingsDialogBookKey).toBe(bookKey);
    expect(useSettingsStore.getState().isSettingsDialogOpen).toBe(true);
  });
});
