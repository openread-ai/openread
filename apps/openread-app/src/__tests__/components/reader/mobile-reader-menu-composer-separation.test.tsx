import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import InlineQuestionBar from '@/app/reader/components/InlineQuestionBar';
import { MobileReaderMenuLauncher } from '@/app/reader/components/mobile/MobileReaderMenuLauncher';

const mockState = vi.hoisted(() => ({
  createConversation: vi.fn(),
  setPendingQuestion: vi.fn(),
  openMobileReaderPanel: vi.fn(),
  setHoveredBookKey: vi.fn(),
  activePanel: null as { bookKey: string; destination: string } | null,
}));

const mockCreateConversation = mockState.createConversation;
const mockSetPendingQuestion = mockState.setPendingQuestion;
const mockOpenMobileReaderPanel = mockState.openMobileReaderPanel;
const mockSetHoveredBookKey = mockState.setHoveredBookKey;

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    appService: {
      isMobile: true,
      isIOSApp: false,
      isAndroidApp: false,
      appPlatform: 'web',
    },
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: { aiSettings: { enabled: true } } }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ safeAreaInsets: { bottom: 0 } }),
}));

vi.mock('@/store/readerStore', () => {
  const state = {
    hoveredBookKey: '',
    setHoveredBookKey: mockState.setHoveredBookKey,
  };
  return {
    useReaderStore: (selector?: (value: typeof state) => unknown) =>
      selector ? selector(state) : state,
  };
});

vi.mock('@/store/notebookStore', () => {
  const state = {
    isNotebookVisible: false,
    isNotebookPinned: false,
    notebookWidth: 0,
    notebookActiveTab: 'notes',
    setNotebookVisible: vi.fn(),
    setNotebookActiveTab: vi.fn(),
  };
  return {
    useNotebookStore: (selector?: (value: typeof state) => unknown) =>
      selector ? selector(state) : state,
  };
});

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({
    isSideBarPinned: false,
    isSideBarVisible: false,
    sideBarWidth: 0,
  }),
}));

vi.mock('@/store/mobileReaderPanelStore', () => {
  const getState = () => ({
    activePanel: mockState.activePanel,
    openMobileReaderPanel: mockState.openMobileReaderPanel,
  });
  return {
    selectIsAnyMobileReaderPanelOpen: (value: ReturnType<typeof getState>) =>
      value.activePanel !== null,
    useMobileReaderPanelStore: (selector?: (value: ReturnType<typeof getState>) => unknown) => {
      const state = getState();
      return selector ? selector(state) : state;
    },
  };
});

vi.mock('@/store/aiChatStore', () => ({
  useAIChatStore: () => ({
    createConversation: mockState.createConversation,
    setPendingQuestion: mockState.setPendingQuestion,
  }),
}));

vi.mock('@/app/reader/hooks/usePrimaryBookHash', () => ({
  usePrimaryBookHash: () => ({
    primaryBookHash: 'book-hash-1',
    getParallelHashes: () => ['parallel-hash-1'],
  }),
}));

vi.mock('@/app/reader/components/ViewMenu', () => ({
  default: ({ setIsDropdownOpen }: { setIsDropdownOpen?: (open: boolean) => void }) => (
    <div data-testid='mock-view-menu'>
      <button type='button' onClick={() => setIsDropdownOpen?.(false)}>
        Close ViewMenu
      </button>
    </div>
  ),
}));

describe('mobile web reader menu and composer separation', () => {
  beforeEach(() => {
    mockState.activePanel = null;
    mockCreateConversation.mockResolvedValue('conversation-1');
    mockSetPendingQuestion.mockClear();
    mockOpenMobileReaderPanel.mockClear();
    mockSetHoveredBookKey.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders separate sibling controls for mobile web reader menu and Ask AI composer', () => {
    render(<InlineQuestionBar bookKey='book-1' />);

    const dock = screen.getByTestId('mobile-reader-dock');
    const menuButton = screen.getByTestId('mobile-reader-menu-button');
    const composerInput = screen.getByTestId('mobile-ai-inline-composer-input');

    expect(dock.contains(menuButton)).toBe(true);
    expect(dock.contains(composerInput)).toBe(true);
    expect(menuButton.closest('form')).toBeNull();
    expect(composerInput.closest('form')).toBeTruthy();
  });

  it('opens and closes the existing ViewMenu without submitting the composer', () => {
    render(<InlineQuestionBar bookKey='book-1' />);

    fireEvent.click(screen.getByTestId('mobile-reader-menu-button'));

    expect(screen.getByTestId('mock-view-menu')).toBeTruthy();
    expect(mockCreateConversation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Close ViewMenu'));

    expect(screen.queryByTestId('mock-view-menu')).toBeNull();
  });

  it('hides the standalone dock when the mobile Read AI sheet owns the surface', () => {
    mockState.activePanel = { bookKey: 'book-1', destination: 'ai-chat-history' };

    render(<InlineQuestionBar bookKey='book-1' />);

    expect(screen.queryByTestId('mobile-reader-menu-button')).toBeNull();
    expect(screen.queryByTestId('mobile-ai-inline-composer-input')).toBeNull();
  });

  it('keeps Ask AI composer submission behavior unchanged', async () => {
    render(<InlineQuestionBar bookKey='book-1' />);

    fireEvent.change(screen.getByTestId('mobile-ai-inline-composer-input'), {
      target: { value: 'What is this chapter about?' },
    });
    fireEvent.click(screen.getByTestId('mobile-ai-inline-composer-send'));

    await waitFor(() => {
      expect(mockCreateConversation).toHaveBeenCalledWith(
        'book-hash-1',
        'What is this chapter about?',
        ['parallel-hash-1'],
      );
    });
    expect(mockSetPendingQuestion).toHaveBeenCalledWith('What is this chapter about?');
    expect(mockOpenMobileReaderPanel).toHaveBeenCalledWith('book-1', 'ai-chat-history', {
      initialQuestion: 'What is this chapter about?',
      initialQuestionConversationId: 'conversation-1',
    });
  });
});

describe('MobileReaderMenuLauncher', () => {
  afterEach(() => {
    cleanup();
  });

  it('owns menu open state and closes on outside pointer interaction', () => {
    render(
      <div>
        <MobileReaderMenuLauncher bookKey='book-1' />
        <button type='button'>Outside</button>
      </div>,
    );

    fireEvent.click(screen.getByTestId('mobile-reader-menu-button'));
    expect(screen.getByTestId('mock-view-menu')).toBeTruthy();

    fireEvent.pointerDown(screen.getByText('Outside'));
    expect(screen.queryByTestId('mock-view-menu')).toBeNull();
  });
});
