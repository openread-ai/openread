import React from 'react';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopFooterBar from '@/app/reader/components/footerbar/DesktopFooterBar';
import { navigateReaderToAppliedProgress } from '@/app/reader/utils/readerNavigationHistory';
import useShortcuts from '@/hooks/useShortcuts';
import type { FoliateView } from '@/types/view';
import { View } from '../../../../../packages/foliate-js/view.js';

const readerMocks = vi.hoisted(() => ({ view: null as unknown }));

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
    getView: () => readerMocks.view,
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
  default: ({ label, disabled }: { label: string; disabled?: boolean }) => (
    <button type='button' disabled={disabled}>
      {label}
    </button>
  ),
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
  readerMocks.view = {
    renderer: { atEnd: false },
    history: { canGoBack: false, canGoForward: false },
  };
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

const createInitializedView = async () => {
  const view = new View() as unknown as FoliateView & {
    resolveNavigation: (target: string) => string;
  };
  view.resolveNavigation = (target: string) => target;
  view.renderer = {
    goTo: vi.fn().mockResolvedValue(undefined),
  } as unknown as FoliateView['renderer'];
  await view.init({ lastLocation: 'epubcfi(/6/2)' });
  readerMocks.view = view;
  return view;
};

const renderGoBackButton = () => {
  render(
    <SliderShortcutHarness
      onGoRight={vi.fn()}
      navigationHandlers={createNavigationHandlers()}
      progressFraction={0}
    />,
  );
  return screen.getByRole('button', { name: 'Go Back' }) as HTMLButtonElement;
};

describe('reader navigation history', () => {
  it('keeps Go Back unavailable when a cold reader applies restored progress', async () => {
    const view = await createInitializedView();

    await navigateReaderToAppliedProgress(view, 'epubcfi(/6/6)', true);

    expect(renderGoBackButton().disabled).toBe(true);
  });

  it('makes Go Back available after genuine navigation from a restored position', async () => {
    const view = await createInitializedView();
    await navigateReaderToAppliedProgress(view, 'epubcfi(/6/6)', true);

    await view.goTo('epubcfi(/6/8)');

    expect(renderGoBackButton().disabled).toBe(false);
  });

  it('keeps genuine back history when remote progress arrives mid-session', async () => {
    const view = await createInitializedView();
    await navigateReaderToAppliedProgress(view, 'epubcfi(/6/6)', true);
    await view.goTo('epubcfi(/6/8)');

    await navigateReaderToAppliedProgress(view, 'epubcfi(/6/10)', false);

    expect(renderGoBackButton().disabled).toBe(false);
  });
});
