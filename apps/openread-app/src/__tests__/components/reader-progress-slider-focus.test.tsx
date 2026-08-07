import React from 'react';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopFooterBar from '@/app/reader/components/footerbar/DesktopFooterBar';
import useShortcuts from '@/hooks/useShortcuts';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: { isMobile: false, hasSafeAreaInset: false } }),
}));

vi.mock('@/helpers/settings', () => ({
  saveViewSettings: vi.fn(),
}));

vi.mock('@/services/settings/settingsLocalAdapter', () => ({
  settingsLocalAdapter: {
    getCustomShortcuts: () => ({}),
  },
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    hoveredBookKey: 'book-1',
    getView: () => ({
      renderer: { atEnd: false },
      history: { canGoBack: false, canGoForward: false },
    }),
    getViewState: () => ({ ttsEnabled: false }),
    getProgress: () => ({
      section: { current: 0, total: 1 },
      pageinfo: { current: 0, next: 1, total: 2 },
    }),
    getViewSettings: () => ({
      progressStyle: 'fraction',
      progressInfoMode: 'progress',
      showProgressInfo: true,
      showRemainingTime: false,
      showRemainingPages: false,
      tapToToggleFooter: false,
      vertical: false,
      doubleBorder: false,
      isEink: false,
      rtl: false,
    }),
  }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookDataByReaderKey: () => ({
      isFixedLayout: false,
      book: { format: 'epub' },
      bookDoc: { rendition: { layout: 'reflowable' } },
    }),
  }),
}));

vi.mock('@/components/Button', () => ({
  default: ({ label }: { label: string }) => <button type='button'>{label}</button>,
}));

type NavigationHandlers = React.ComponentProps<typeof DesktopFooterBar>['navigationHandlers'];

function createNavigationHandlers(): NavigationHandlers {
  return {
    onPrevPage: vi.fn(),
    onNextPage: vi.fn(),
    onPrevSection: vi.fn(),
    onNextSection: vi.fn(),
    onGoBack: vi.fn(),
    onGoForward: vi.fn(),
    onProgressChange: vi.fn(),
  };
}

function SliderShortcutHarness({
  onGoRight,
  navigationHandlers,
  progressFraction,
}: {
  onGoRight: () => void;
  navigationHandlers: NavigationHandlers;
  progressFraction: number;
}) {
  useShortcuts({ onGoRight }, [onGoRight]);

  return (
    <DesktopFooterBar
      bookKey='book-1'
      navigationHandlers={navigationHandlers}
      progressFraction={progressFraction}
      progressValid
      gridInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
      actionTab=''
      onSetActionTab={vi.fn()}
      onSpeakText={vi.fn()}
    />
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('desktop reader progress slider focus', () => {
  it('returns ArrowRight to reader navigation after pointer interaction completes', () => {
    const onGoRight = vi.fn();
    render(
      <SliderShortcutHarness
        onGoRight={onGoRight}
        navigationHandlers={createNavigationHandlers()}
        progressFraction={1}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Jump to Location' });

    fireEvent.pointerDown(slider);
    slider.focus();
    fireEvent.pointerUp(slider);
    fireEvent.keyDown(window, { key: 'ArrowRight', code: 'ArrowRight' });

    expect(onGoRight).toHaveBeenCalledTimes(1);
  });

  it('keeps keyboard-focused slider arrow interaction native and focused', () => {
    const onGoRight = vi.fn();
    const navigationHandlers = createNavigationHandlers();
    render(
      <SliderShortcutHarness
        onGoRight={onGoRight}
        navigationHandlers={navigationHandlers}
        progressFraction={0.5}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Jump to Location' }) as HTMLInputElement;

    slider.focus();
    fireEvent.keyDown(slider, { key: 'ArrowRight', code: 'ArrowRight' });
    fireEvent.change(slider, { target: { value: '51' } });
    fireEvent.keyUp(slider, { key: 'ArrowRight', code: 'ArrowRight' });

    expect(document.activeElement).toBe(slider);
    expect(slider.tabIndex).toBe(0);
    expect(navigationHandlers.onProgressChange).toHaveBeenCalledWith(51);
    expect(onGoRight).not.toHaveBeenCalled();
  });

  it('keeps touch pointer interaction focused', () => {
    render(
      <SliderShortcutHarness
        onGoRight={vi.fn()}
        navigationHandlers={createNavigationHandlers()}
        progressFraction={0.5}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Jump to Location' });

    slider.focus();
    const touchPointerUp = createEvent.pointerUp(slider);
    Object.defineProperty(touchPointerUp, 'pointerType', { value: 'touch' });
    fireEvent(slider, touchPointerUp);

    expect(document.activeElement).toBe(slider);
  });
});
