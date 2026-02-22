import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';

// Mock the translation hook
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

// Mock cn utility
vi.mock('@/utils/tailwind', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}));

// Track dialog open state for tests
let lastOnOpenChange: ((open: boolean) => void) | undefined;

// Mock Dialog primitives
vi.mock('@/components/primitives/dialog', () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => {
    lastOnOpenChange = onOpenChange;
    return open ? <div data-testid='dialog-root'>{children}</div> : null;
  },
  DialogContent: ({
    children,
    className,
    'data-testid': testId,
  }: {
    children: React.ReactNode;
    className?: string;
    'data-testid'?: string;
  }) => (
    <div data-testid={testId || 'dialog-content'} className={className}>
      {children}
    </div>
  ),
  DialogTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid='dialog-title' className={className}>
      {children}
    </span>
  ),
}));

// Mock Button component
vi.mock('@/components/primitives/button', () => ({
  Button: ({
    children,
    onClick,
    className,
    variant,
    'data-testid': testId,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    variant?: string;
    'data-testid'?: string;
  }) => (
    <button
      data-testid={testId || 'button'}
      onClick={onClick}
      className={className}
      data-variant={variant}
    >
      {children}
    </button>
  ),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  BookOpen: ({
    'data-testid': testId,
    className,
  }: {
    'data-testid'?: string;
    className?: string;
  }) => <svg data-testid={testId || 'icon-book-open'} className={className} />,
  Bot: ({ 'data-testid': testId, className }: { 'data-testid'?: string; className?: string }) => (
    <svg data-testid={testId || 'icon-bot'} className={className} />
  ),
  Cloud: ({ 'data-testid': testId, className }: { 'data-testid'?: string; className?: string }) => (
    <svg data-testid={testId || 'icon-cloud'} className={className} />
  ),
  ChevronRight: ({ className }: { className?: string }) => (
    <svg data-testid='icon-chevron-right' className={className} />
  ),
  ChevronLeft: ({ className }: { className?: string }) => (
    <svg data-testid='icon-chevron-left' className={className} />
  ),
}));

describe('OnboardingFlow', () => {
  const defaultProps = {
    open: true,
    onComplete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    lastOnOpenChange = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should render the dialog when open is true', () => {
      render(<OnboardingFlow {...defaultProps} />);
      expect(screen.getByTestId('onboarding-dialog')).toBeTruthy();
    });

    it('should not render when open is false', () => {
      render(<OnboardingFlow {...defaultProps} open={false} />);
      expect(screen.queryByTestId('onboarding-dialog')).toBeNull();
    });

    it('should render the first step on initial open', () => {
      render(<OnboardingFlow {...defaultProps} />);
      expect(screen.getByTestId('step-title').textContent).toBe('Welcome to OpenRead');
      expect(screen.getByTestId('step-description').textContent).toBe(
        'Your cross-platform ebook reader with AI-powered reading assistance. Import EPUBs, PDFs, and more.',
      );
    });

    it('should render step indicator dots', () => {
      render(<OnboardingFlow {...defaultProps} />);
      expect(screen.getByTestId('step-indicators')).toBeTruthy();
      expect(screen.getByTestId('step-dot-0')).toBeTruthy();
      expect(screen.getByTestId('step-dot-1')).toBeTruthy();
      expect(screen.getByTestId('step-dot-2')).toBeTruthy();
      expect(screen.getByTestId('step-dot-3')).toBeTruthy();
    });

    it('should show the first step dot as active', () => {
      render(<OnboardingFlow {...defaultProps} />);
      const dot0 = screen.getByTestId('step-dot-0');
      const dot1 = screen.getByTestId('step-dot-1');
      expect(dot0.className).toContain('bg-primary');
      expect(dot1.className).toContain('bg-base-300');
    });

    it('should show "Next" button text on first step', () => {
      render(<OnboardingFlow {...defaultProps} />);
      expect(screen.getByTestId('next-button').textContent).toContain('Next');
    });

    it('should not show Back button on first step', () => {
      render(<OnboardingFlow {...defaultProps} />);
      expect(screen.queryByTestId('back-button')).toBeNull();
    });

    it('should render the step icon', () => {
      render(<OnboardingFlow {...defaultProps} />);
      expect(screen.getByTestId('step-icon')).toBeTruthy();
    });
  });

  describe('Navigation', () => {
    it('should navigate to second step when Next is clicked', () => {
      render(<OnboardingFlow {...defaultProps} />);
      fireEvent.click(screen.getByTestId('next-button'));
      expect(screen.getByTestId('step-title').textContent).toBe('Import Your Books');
    });

    it('should show Back button on second step', () => {
      render(<OnboardingFlow {...defaultProps} />);
      fireEvent.click(screen.getByTestId('next-button'));
      expect(screen.getByTestId('back-button')).toBeTruthy();
    });

    it('should navigate back to first step when Back is clicked', () => {
      render(<OnboardingFlow {...defaultProps} />);
      // Go to step 2
      fireEvent.click(screen.getByTestId('next-button'));
      expect(screen.getByTestId('step-title').textContent).toBe('Import Your Books');
      // Go back to step 1
      fireEvent.click(screen.getByTestId('back-button'));
      expect(screen.getByTestId('step-title').textContent).toBe('Welcome to OpenRead');
    });

    it('should navigate through all steps', () => {
      render(<OnboardingFlow {...defaultProps} />);

      // Step 1
      expect(screen.getByTestId('step-title').textContent).toBe('Welcome to OpenRead');

      // Step 2
      fireEvent.click(screen.getByTestId('next-button'));
      expect(screen.getByTestId('step-title').textContent).toBe('Import Your Books');

      // Step 3
      fireEvent.click(screen.getByTestId('next-button'));
      expect(screen.getByTestId('step-title').textContent).toBe('AI Reading Assistant');

      // Step 4
      fireEvent.click(screen.getByTestId('next-button'));
      expect(screen.getByTestId('step-title').textContent).toBe('Sync Across Devices');
    });

    it('should update step indicators as navigation progresses', () => {
      render(<OnboardingFlow {...defaultProps} />);

      // Initially dot 0 is active
      expect(screen.getByTestId('step-dot-0').className).toContain('bg-primary');
      expect(screen.getByTestId('step-dot-1').className).toContain('bg-base-300');

      // After clicking Next, dot 1 is active
      fireEvent.click(screen.getByTestId('next-button'));
      expect(screen.getByTestId('step-dot-0').className).toContain('bg-base-300');
      expect(screen.getByTestId('step-dot-1').className).toContain('bg-primary');
    });

    it('should show "Get Started" on the last step', () => {
      render(<OnboardingFlow {...defaultProps} />);
      // Navigate to last step
      fireEvent.click(screen.getByTestId('next-button')); // step 2
      fireEvent.click(screen.getByTestId('next-button')); // step 3
      fireEvent.click(screen.getByTestId('next-button')); // step 4 (last)

      expect(screen.getByTestId('next-button').textContent).toContain('Get Started');
    });
  });

  describe('Completion', () => {
    it('should call onComplete when "Get Started" is clicked on last step', () => {
      render(<OnboardingFlow {...defaultProps} />);
      // Navigate to last step
      fireEvent.click(screen.getByTestId('next-button'));
      fireEvent.click(screen.getByTestId('next-button'));
      fireEvent.click(screen.getByTestId('next-button'));
      // Click Get Started
      fireEvent.click(screen.getByTestId('next-button'));

      expect(defaultProps.onComplete).toHaveBeenCalledTimes(1);
    });

    it('should call onComplete when dialog is closed via onOpenChange', () => {
      render(<OnboardingFlow {...defaultProps} />);
      // Simulate dialog close (e.g., clicking overlay or pressing Escape)
      expect(lastOnOpenChange).toBeDefined();
      lastOnOpenChange!(false);
      expect(defaultProps.onComplete).toHaveBeenCalledTimes(1);
    });

    it('should not call onComplete when onOpenChange is called with true', () => {
      render(<OnboardingFlow {...defaultProps} />);
      lastOnOpenChange!(true);
      expect(defaultProps.onComplete).not.toHaveBeenCalled();
    });
  });

  describe('Step Content', () => {
    it('should show correct description for step 2', () => {
      render(<OnboardingFlow {...defaultProps} />);
      fireEvent.click(screen.getByTestId('next-button'));
      expect(screen.getByTestId('step-description').textContent).toBe(
        'Drag and drop books into your library, or click the import button. We support EPUB, PDF, MOBI, and more.',
      );
    });

    it('should show correct description for step 3', () => {
      render(<OnboardingFlow {...defaultProps} />);
      fireEvent.click(screen.getByTestId('next-button'));
      fireEvent.click(screen.getByTestId('next-button'));
      expect(screen.getByTestId('step-description').textContent).toBe(
        'Ask questions about your books, get summaries, and have conversations about what you read.',
      );
    });

    it('should show correct description for step 4', () => {
      render(<OnboardingFlow {...defaultProps} />);
      fireEvent.click(screen.getByTestId('next-button'));
      fireEvent.click(screen.getByTestId('next-button'));
      fireEvent.click(screen.getByTestId('next-button'));
      expect(screen.getByTestId('step-description').textContent).toBe(
        'Your library syncs across web, desktop, and mobile. Pick up where you left off on any device.',
      );
    });
  });
});
