import React, { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { Thread } from '@/components/assistant/Thread';
import { MobileChatContent } from '@/app/reader/components/mobile/MobileChatSheet';

const mockState = vi.hoisted(() => ({
  quota: {
    remaining: 10,
    limit: 20,
    limitReached: false,
    resetAt: null as Date | null,
    upgradeUrl: '/settings/billing#plans',
    limitType: 'daily' as const,
    boostBalance: 0,
    canBoost: false,
    dismissLimit: vi.fn(),
  },
  assistant: {
    composerIsEmpty: true,
    isRunning: false,
    messages: [] as Array<{
      role: 'user' | 'assistant';
      content?: Array<{ type: string; text?: string }>;
    }>,
    chatStatus: '',
  },
  aiChat: {
    activeConversationId: 'conversation-1' as string | null,
    createConversation: vi.fn(),
    messages: [] as Array<{ conversationId: string; role: string; content: string }>,
  },
  mobilePanel: {
    clearInitialQuestion: vi.fn(),
    openMobileReaderPanel: vi.fn(),
  },
}));

vi.mock('next/image', () => ({
  default: ({
    alt,
    priority: _priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ''} {...props} />
  ),
}));

vi.mock('@assistant-ui/react', () => {
  const Root = ({ children, className, ...props }: { children: ReactNode; className?: string }) => (
    <div className={className} {...props}>
      {children}
    </div>
  );
  const Empty = ({ children }: { children: ReactNode }) => <>{children}</>;
  const Viewport = React.forwardRef<HTMLDivElement, { children: ReactNode; className?: string }>(
    ({ children, className }, ref) => (
      <div ref={ref} className={className}>
        {children}
      </div>
    ),
  );
  Viewport.displayName = 'MockThreadViewport';

  return {
    ThreadPrimitive: {
      Root,
      Empty,
      Viewport,
      Messages: () => <div data-testid='mock-thread-messages' />,
      ScrollToBottom: ({
        children,
        className,
        ...props
      }: {
        children: ReactNode;
        className?: string;
      }) => (
        <button type='button' className={className} {...props}>
          {children}
        </button>
      ),
    },
    ComposerPrimitive: {
      Root: ({ children, className, ...props }: { children: ReactNode; className?: string }) => (
        <form className={className} {...props}>
          {children}
        </form>
      ),
      Input: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
      Send: ({ children, className, ...props }: { children: ReactNode; className?: string }) => (
        <button type='button' className={className} {...props}>
          {children}
        </button>
      ),
      Cancel: ({ children, className, ...props }: { children: ReactNode; className?: string }) => (
        <button type='button' className={className} {...props}>
          {children}
        </button>
      ),
    },
    AssistantIf: ({ children }: { children: ReactNode }) =>
      mockState.assistant.messages.length > 0 ? <>{children}</> : null,
    ActionBarPrimitive: {
      Root: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      Reload: ({ children }: { children: ReactNode }) => <button type='button'>{children}</button>,
      Copy: ({ children }: { children: ReactNode }) => <button type='button'>{children}</button>,
    },
    BranchPickerPrimitive: {
      Root: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      Previous: ({ children }: { children: ReactNode }) => (
        <button type='button'>{children}</button>
      ),
      Next: ({ children }: { children: ReactNode }) => <button type='button'>{children}</button>,
      Number: () => <span>1</span>,
      Count: () => <span>1</span>,
    },
    MessagePrimitive: {
      Root: ({ children, className, ...props }: { children: ReactNode; className?: string }) => (
        <div className={className} {...props}>
          {children}
        </div>
      ),
      Parts: () => <span>Message</span>,
    },
    useAssistantRuntime: () => ({
      thread: {
        append: vi.fn(),
        cancelRun: vi.fn(),
      },
    }),
    useAssistantState: (
      selector: (state: {
        composer: { isEmpty: boolean };
        thread: { isRunning: boolean };
      }) => unknown,
    ) =>
      selector({
        composer: { isEmpty: mockState.assistant.composerIsEmpty },
        thread: { isRunning: mockState.assistant.isRunning },
      }),
    useThreadViewport: (selector: (state: { isAtBottom: boolean }) => unknown) =>
      selector({ isAtBottom: true }),
    useThread: (
      selector: (state: {
        messages: typeof mockState.assistant.messages;
        isRunning: boolean;
      }) => unknown,
    ) =>
      selector({
        messages: mockState.assistant.messages,
        isRunning: mockState.assistant.isRunning,
      }),
  };
});

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/store/aiQuotaStore', () => ({
  useAIQuotaStore: (selector: (state: typeof mockState.quota) => unknown) =>
    selector(mockState.quota),
}));

vi.mock('@/store/aiChatStore', () => ({
  useAIChatStore: (selector: (state: typeof mockState.aiChat) => unknown) =>
    selector(mockState.aiChat),
}));

vi.mock('@/store/mobileReaderPanelStore', () => ({
  useMobileReaderPanelStore: (selector: (state: typeof mockState.mobilePanel) => unknown) =>
    selector(mockState.mobilePanel),
}));

vi.mock('@/app/reader/hooks/usePrimaryBookHash', () => ({
  usePrimaryBookHash: () => ({
    primaryBookHash: 'book-hash-1',
    getParallelHashes: () => [],
  }),
}));

vi.mock('@/app/reader/components/notebook/AIAssistant', () => ({
  default: ({ mobileWebHeader }: { mobileWebHeader?: ReactNode }) => (
    <div data-testid='mock-ai-assistant'>{mobileWebHeader}</div>
  ),
}));

vi.mock('@/app/reader/components/sidebar/ChatHistoryView', () => ({
  default: () => <div data-testid='mock-chat-history' />,
}));

vi.mock('@/services/annotation/nativeMenuBridge', () => ({
  postChatComposer: vi.fn(),
}));

vi.mock('@/services/bridge/bridgeService', () => ({
  bridge: {
    on: vi.fn(() => vi.fn()),
  },
}));

describe('mobile web Read AI sheet polish', () => {
  beforeEach(() => {
    mockState.assistant.composerIsEmpty = true;
    mockState.assistant.isRunning = false;
    mockState.assistant.messages = [];
    mockState.quota.limitReached = false;
    mockState.quota.resetAt = null;
    mockState.aiChat.activeConversationId = 'conversation-1';
    mockState.aiChat.createConversation.mockResolvedValue('conversation-2');
    mockState.aiChat.messages = [];
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('uses the canonical full-width mobile Read AI composer chrome in the empty sheet state', () => {
    render(
      <Thread surface='mobile-web-sheet' mobileWebHeader={<div data-testid='sheet-header' />} />,
    );

    const composer = screen.getByTestId('assistant-composer');
    const frame = document.querySelector('[data-openread-mobile-read-ai-composer-frame]');

    expect(composer.className).toContain('w-full');
    expect(frame).toBeTruthy();
    expect(frame?.className).toContain('w-full');
    expect(frame?.className).toContain('rounded-[1.75rem]');
    expect(screen.getByTestId('sheet-header')).toBeTruthy();
  });

  it('keeps the mobile web active-chat header compact and visually identical when expanded', () => {
    const { rerender } = render(
      <MobileChatContent
        bookKey='book-1'
        layout='mobile-web'
        initialView='active'
        isExpanded={false}
      />,
    );

    const halfHeader = screen.getByTestId('mobile-read-ai-header');
    const halfTitle = screen.getByText('Read AI');
    expect(screen.getByLabelText('Close Read AI')).toBeTruthy();

    rerender(
      <MobileChatContent bookKey='book-1' layout='mobile-web' initialView='active' isExpanded />,
    );

    const expandedHeader = screen.getByTestId('mobile-read-ai-expanded-header');
    const expandedTitle = screen.getByText('Read AI');

    expect(expandedHeader.className).toBe(halfHeader.className);
    expect(expandedTitle.className).toBe(halfTitle.className);
    expect(expandedHeader.querySelector('.size-16')).toBeNull();
    expect(screen.getByLabelText('Chat history')).toBeTruthy();
  });

  it('keeps the mobile web history header compact and visually identical when expanded', () => {
    const { rerender } = render(
      <MobileChatContent
        bookKey='book-1'
        layout='mobile-web'
        initialView='history'
        isExpanded={false}
      />,
    );

    const halfHeader = screen.getByTestId('mobile-read-ai-header');
    const halfTitle = screen.getByText('Read AI');
    expect(screen.getByLabelText('Back to chat')).toBeTruthy();

    rerender(
      <MobileChatContent bookKey='book-1' layout='mobile-web' initialView='history' isExpanded />,
    );

    const expandedHeader = screen.getByTestId('mobile-read-ai-expanded-header');
    const expandedTitle = screen.getByText('Read AI');

    expect(expandedHeader.className).toBe(halfHeader.className);
    expect(expandedTitle.className).toBe(halfTitle.className);
    expect(expandedHeader.querySelector('.size-16')).toBeNull();
    expect(screen.getByLabelText('Back to chat')).toBeTruthy();
  });
});
