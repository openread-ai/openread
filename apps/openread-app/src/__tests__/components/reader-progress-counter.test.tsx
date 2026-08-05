import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopFooterBar from '@/app/reader/components/footerbar/DesktopFooterBar';
import ProgressInfoView from '@/app/reader/components/ProgressInfo';

const mockState = vi.hoisted(() => ({
  atEnd: true,
  progress: {
    section: { current: 5, total: 6 },
    pageinfo: { current: 254, next: 257, total: 258 },
  },
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, values?: Record<string, string | number>) =>
    Object.entries(values ?? {}).reduce(
      (result, [name, value]) => result.replace(`{{${name}}}`, String(value)),
      key,
    ),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: { isMobile: true, hasSafeAreaInset: false } }),
}));

vi.mock('@/helpers/settings', () => ({
  saveViewSettings: vi.fn(),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    hoveredBookKey: 'book-1',
    getView: () => ({
      renderer: { atEnd: mockState.atEnd },
      history: { canGoBack: false, canGoForward: false },
    }),
    getViewState: () => ({ ttsEnabled: false }),
    getProgress: () => mockState.progress,
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

const navigationHandlers = {
  onPrevPage: vi.fn(),
  onNextPage: vi.fn(),
  onPrevSection: vi.fn(),
  onNextSection: vi.fn(),
  onGoBack: vi.fn(),
  onGoForward: vi.fn(),
  onProgressChange: vi.fn(),
};

beforeEach(() => {
  mockState.atEnd = true;
  mockState.progress.pageinfo.current = 254;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('reader terminal progress counter', () => {
  it.each([
    { width: 1600, locationCurrent: 254, rawCounter: '255 / 258' },
    { width: 900, locationCurrent: 256, rawCounter: '257 / 258' },
  ])(
    'shows 258 / 258 at the true end at $width px despite a raw $rawCounter location',
    ({ width, locationCurrent, rawCounter }) => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      mockState.progress.pageinfo.current = locationCurrent;

      render(
        <DesktopFooterBar
          bookKey='book-1'
          navigationHandlers={navigationHandlers}
          progressFraction={(locationCurrent + 1) / 258}
          progressValid
          gridInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
          actionTab=''
          onSetActionTab={vi.fn()}
          onSpeakText={vi.fn()}
        />,
      );

      expect(screen.getByText('258 / 258')).toBeTruthy();
      expect(screen.getByLabelText('Reading Progress: 100%')).toBeTruthy();
      expect(screen.queryByText(rawCounter)).toBeNull();
    },
  );

  it('shows total / total in the shared mobile progress display', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

    render(
      <ProgressInfoView
        bookKey='book-1'
        section={mockState.progress.section}
        pageinfo={mockState.progress.pageinfo}
        timeinfo={{ section: 1, total: 1 }}
        horizontalGap={5}
        contentInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
        gridInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
      />,
    );

    expect(screen.getByText('258 / 258')).toBeTruthy();
    expect(screen.getByLabelText(/On 258 of 258 page/)).toBeTruthy();
  });

  it('keeps the location counter unchanged before the renderer reaches the end', () => {
    mockState.atEnd = false;

    render(
      <DesktopFooterBar
        bookKey='book-1'
        navigationHandlers={navigationHandlers}
        progressFraction={255 / 258}
        progressValid
        gridInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
        actionTab=''
        onSetActionTab={vi.fn()}
        onSpeakText={vi.fn()}
      />,
    );

    expect(screen.getByText('255 / 258')).toBeTruthy();
    expect(screen.queryByText('258 / 258')).toBeNull();
  });
});
