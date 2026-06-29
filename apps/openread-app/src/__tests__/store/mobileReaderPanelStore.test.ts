import { beforeEach, describe, expect, it } from 'vitest';

import {
  selectIsAnyMobileReaderPanelOpen,
  selectIsMobileReaderPanelDestinationOpenForBook,
  selectIsMobileReaderPanelOpenForBook,
  useMobileReaderPanelStore,
  type MobileReaderPanelState,
} from '@/store/mobileReaderPanelStore';

function state() {
  return useMobileReaderPanelStore.getState();
}

describe('mobileReaderPanelStore panel-open selectors', () => {
  beforeEach(() => {
    useMobileReaderPanelStore.setState({ activePanel: null });
  });

  it('tracks canonical any-panel-open state from activePanel', () => {
    expect(selectIsAnyMobileReaderPanelOpen(state())).toBe(false);

    state().openMobileReaderPanel('book-1', 'ai-chat-history');

    expect(selectIsAnyMobileReaderPanelOpen(state())).toBe(true);
  });

  it('tracks book-specific and destination-specific panel ownership', () => {
    state().openMobileReaderPanel('book-1', 'ai-chat-history', { initialAIChatView: 'active' });

    expect(selectIsMobileReaderPanelOpenForBook('book-1')(state())).toBe(true);
    expect(selectIsMobileReaderPanelOpenForBook('book-2')(state())).toBe(false);
    expect(
      selectIsMobileReaderPanelDestinationOpenForBook('book-1', 'ai-chat-history')(state()),
    ).toBe(true);
    expect(selectIsMobileReaderPanelDestinationOpenForBook('book-1', 'toc')(state())).toBe(false);
  });

  it('keeps selector helpers derived from state only', () => {
    const closedState: Pick<MobileReaderPanelState, 'activePanel'> = { activePanel: null };
    const openState: Pick<MobileReaderPanelState, 'activePanel'> = {
      activePanel: { bookKey: 'book-1', destination: 'settings' },
    };

    expect(selectIsAnyMobileReaderPanelOpen(closedState)).toBe(false);
    expect(selectIsAnyMobileReaderPanelOpen(openState)).toBe(true);
    expect(selectIsMobileReaderPanelDestinationOpenForBook('book-1', 'settings')(openState)).toBe(
      true,
    );
  });
});
