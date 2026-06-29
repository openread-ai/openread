import React from 'react';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import HalfSheet from '@/app/reader/components/mobile/HalfSheet';
import { useTouchEvent } from '@/app/reader/hooks/useIframeEvents';

const mockState = vi.hoisted(() => ({
  activePanel: null as { bookKey: string; destination: string } | null,
  hoveredBookKey: 'book-1' as string | null,
  setHoveredBookKey: vi.fn(),
  handleDragEnd: undefined as
    | ((data: {
        velocity: number;
        deltaT: number;
        clientX: number;
        clientY: number;
        deltaX: number;
        deltaY: number;
      }) => void)
    | undefined,
}));

vi.mock('@tauri-apps/plugin-haptics', () => ({
  impactFeedback: vi.fn(),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    appService: {
      isMobile: true,
      isIOSApp: false,
      isAndroidApp: false,
      appPlatform: 'web',
      hasHaptics: false,
    },
  }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ safeAreaInsets: { top: 0, bottom: 0 } }),
}));

vi.mock('@/hooks/useDrag', () => ({
  useDrag: (
    _onDragMove: unknown,
    _onDragKeyDown: unknown,
    onDragEnd?: NonNullable<typeof mockState.handleDragEnd>,
  ) => {
    mockState.handleDragEnd = onDragEnd;
    return { handleDragStart: vi.fn(), handleDragKeyDown: vi.fn() };
  },
}));

vi.mock('@/store/mobileReaderPanelStore', () => {
  const useMobileReaderPanelStore = Object.assign(vi.fn(), {
    getState: () => ({ activePanel: mockState.activePanel }),
  });

  return {
    useMobileReaderPanelStore,
    selectIsAnyMobileReaderPanelOpen: (state: { activePanel: unknown }) =>
      state.activePanel !== null,
  };
});

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    hoveredBookKey: mockState.hoveredBookKey,
    setHoveredBookKey: mockState.setHoveredBookKey,
    getViewSettings: () => ({
      layoutMode: 'continuous',
      vertical: true,
      pageZoomLevel: 100,
    }),
  }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookDataByReaderKey: () => ({
      isFixedLayout: false,
      bookDoc: { rendition: { layout: 'reflowable' } },
      book: { format: 'epub' },
    }),
  }),
}));

vi.mock('@/store/notebookStore', () => ({
  useNotebookStore: {
    getState: () => ({ isNotebookVisible: false }),
  },
}));

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: {
    getState: () => ({ isSideBarVisible: false }),
  },
}));

describe('HalfSheet lifecycle hardening', () => {
  beforeEach(() => {
    mockState.handleDragEnd = undefined;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('resets expanded state after close/reopen without mutating state during render', async () => {
    const children = ({ isExpanded }: { isExpanded: boolean }) => (
      <div data-testid='half-sheet-state'>{isExpanded ? 'expanded' : 'half'}</div>
    );
    const onClose = vi.fn();

    const { rerender } = render(
      <HalfSheet isOpen onClose={onClose} chrome='drag-handle'>
        {children}
      </HalfSheet>,
    );

    expect(screen.getByTestId('half-sheet-state').textContent).toBe('half');

    act(() => {
      mockState.handleDragEnd?.({
        velocity: 0,
        deltaT: 100,
        clientX: 0,
        clientY: 0,
        deltaX: 0,
        deltaY: -120,
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId('half-sheet-state').textContent).toBe('expanded'),
    );

    rerender(
      <HalfSheet isOpen={false} onClose={onClose} chrome='drag-handle'>
        {children}
      </HalfSheet>,
    );

    await waitFor(() => expect(screen.queryByTestId('half-sheet-state')).toBeNull());

    rerender(
      <HalfSheet isOpen onClose={onClose} chrome='drag-handle'>
        {children}
      </HalfSheet>,
    );

    await waitFor(() => expect(screen.getByTestId('half-sheet-state').textContent).toBe('half'));
  });
});

describe('iframe touch handling with canonical panel state', () => {
  beforeEach(() => {
    mockState.activePanel = null;
    mockState.hoveredBookKey = 'book-1';
    mockState.setHoveredBookKey.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('does not dismiss reader chrome while any mobile reader panel is open', () => {
    mockState.activePanel = { bookKey: 'book-1', destination: 'ai-chat-history' };
    const handlePageFlip = vi.fn();
    const { result } = renderHook(() => useTouchEvent('book-1', handlePageFlip));

    act(() => {
      result.current.onTouchStart({
        timeStamp: 0,
        targetTouches: [{ clientX: 10, clientY: 10, screenX: 10, screenY: 10 }],
      });
      result.current.onTouchMove({
        timeStamp: 10,
        targetTouches: [{ clientX: 10, clientY: 40, screenX: 10, screenY: 40 }],
      });
      result.current.onTouchEnd({
        timeStamp: 20,
        targetTouches: [],
        changedTouches: [{ clientX: 10, clientY: 40, screenX: 10, screenY: 40 }],
      });
    });

    expect(mockState.setHoveredBookKey).not.toHaveBeenCalledWith(null);
  });

  it('continues to dismiss reader chrome when no panel owns the surface', () => {
    mockState.activePanel = null;
    const handlePageFlip = vi.fn();
    const { result } = renderHook(() => useTouchEvent('book-1', handlePageFlip));

    act(() => {
      result.current.onTouchStart({
        timeStamp: 0,
        targetTouches: [{ clientX: 10, clientY: 10, screenX: 10, screenY: 10 }],
      });
      result.current.onTouchMove({
        timeStamp: 10,
        targetTouches: [{ clientX: 10, clientY: 40, screenX: 10, screenY: 40 }],
      });
    });

    expect(mockState.setHoveredBookKey).toHaveBeenCalledWith(null);
  });
});
