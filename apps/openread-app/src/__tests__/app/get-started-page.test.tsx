import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import GetStartedPage from '@/app/(platform)/get-started/page';

const mockReplace = vi.fn();
const mockOpenImportPicker = vi.fn();
const mockCompleteOnboarding = vi.fn();
let mockVisibleBookCount = 0;
let mockVariant: 'onboarding' | 'empty-library' = 'onboarding';
let mockLibraryLoaded = true;
let mockImportDisabled = false;
let mockImportDisabledReason: string | null = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock('@/context/LibraryLifecycleContext', () => ({
  useLibraryLifecycle: () => ({ libraryLoaded: mockLibraryLoaded }),
}));

vi.mock('@/hooks/useEmptyLibraryOnboarding', () => ({
  useEmptyLibraryOnboarding: () => ({
    variant: mockVariant,
    completeOnboarding: mockCompleteOnboarding,
    onboardingCompleted: mockVariant === 'empty-library',
    shouldRouteToGetStarted: mockVariant === 'onboarding',
  }),
}));

vi.mock('@/hooks/useBookImport', () => ({
  useBookImport: () => ({
    openImportPicker: mockOpenImportPicker,
    importDisabled: mockImportDisabled,
    importDisabledReason: mockImportDisabledReason,
  }),
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: Object.assign(vi.fn(), {
    getState: () => ({
      getVisibleLibrary: () =>
        Array.from({ length: mockVisibleBookCount }, (_, index) => ({
          hash: `book-${index}`,
        })),
    }),
  }),
}));

vi.mock('@/components/platform/empty-library-start-screen', () => ({
  EmptyLibraryStartScreen: ({
    variant,
    onImport,
    onDismissOnboarding,
    importDisabled,
    importDisabledReason,
  }: {
    variant: 'onboarding' | 'empty-library';
    onImport: () => void;
    onDismissOnboarding: () => void;
    importDisabled?: boolean;
    importDisabledReason?: string | null;
  }) => (
    <div data-testid='start-screen' data-variant={variant}>
      <button
        data-testid='import'
        onClick={onImport}
        disabled={importDisabled}
        title={importDisabledReason ?? undefined}
      >
        Import
      </button>
      <button data-testid='dismiss' onClick={onDismissOnboarding}>
        Dismiss
      </button>
    </div>
  ),
}));

describe('GetStartedPage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockOpenImportPicker.mockResolvedValue({
      successCount: 0,
      failCount: 0,
      skippedForLimitCount: 0,
    });
    mockVisibleBookCount = 0;
    mockVariant = 'onboarding';
    mockLibraryLoaded = true;
    mockImportDisabled = false;
    mockImportDisabledReason = null;
  });

  it('renders the onboarding variant from account-scoped onboarding state', () => {
    render(<GetStartedPage />);

    expect(screen.getByTestId('start-screen').dataset.variant).toBe('onboarding');
  });

  it('renders the empty-library variant for completed onboarding or existing empty library', () => {
    mockVariant = 'empty-library';

    render(<GetStartedPage />);

    expect(screen.getByTestId('start-screen').dataset.variant).toBe('empty-library');
  });

  it('passes the honest unavailable reason to the onboarding import control', () => {
    mockImportDisabled = true;
    mockImportDisabledReason = 'Unable to verify your library limit. Please try again.';

    render(<GetStartedPage />);

    const importButton = screen.getByTestId('import') as HTMLButtonElement;
    expect(importButton.disabled).toBe(true);
    expect(importButton.title).toBe(mockImportDisabledReason);
  });

  it('completes onboarding and routes home after successful import creates visible books', async () => {
    mockOpenImportPicker.mockResolvedValue({
      successCount: 1,
      failCount: 0,
      skippedForLimitCount: 0,
    });
    mockVisibleBookCount = 1;

    render(<GetStartedPage />);
    screen.getByTestId('import').click();

    await waitFor(() => {
      expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
  });

  it('completes onboarding and routes home when dismissed without importing', () => {
    render(<GetStartedPage />);

    screen.getByTestId('dismiss').click();

    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/home');
    expect(mockCompleteOnboarding.mock.invocationCallOrder[0]).toBeLessThan(
      mockReplace.mock.invocationCallOrder[0]!,
    );
  });
});
