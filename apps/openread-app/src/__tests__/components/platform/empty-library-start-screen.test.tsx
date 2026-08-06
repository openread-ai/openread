import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { EmptyLibraryStartScreen } from '@/components/platform/empty-library-start-screen';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

describe('EmptyLibraryStartScreen', () => {
  const mockOnImport = vi.fn();
  const mockOnDismiss = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('renders onboarding copy with canonical CTAs and dismiss action', () => {
    render(
      <EmptyLibraryStartScreen
        variant='onboarding'
        onImport={mockOnImport}
        onDismissOnboarding={mockOnDismiss}
      />,
    );

    expect(screen.getByTestId('empty-library-start-screen').dataset.variant).toBe('onboarding');
    expect(screen.getByTestId('empty-library-heading').textContent).toBe('Welcome to OpenRead');
    expect(screen.getByTestId('empty-library-import-btn').textContent).toContain('Import a Book');
    expect(screen.getByTestId('empty-library-explore-btn').getAttribute('href')).toBe('/explore');
    expect(screen.getByTestId('empty-library-dismiss-btn').textContent).toContain('Skip for now');
  });

  it('renders empty-library copy without onboarding dismiss action', () => {
    render(<EmptyLibraryStartScreen variant='empty-library' onImport={mockOnImport} />);

    expect(screen.getByTestId('empty-library-start-screen').dataset.variant).toBe('empty-library');
    expect(screen.getByTestId('empty-library-heading').textContent).toBe('Your library is empty');
    expect(screen.getByTestId('empty-library-import-btn').textContent).toContain('Import a Book');
    expect(screen.getByTestId('empty-library-explore-btn').getAttribute('href')).toBe('/explore');
    expect(screen.queryByTestId('empty-library-dismiss-btn')).toBeNull();
  });

  it('explains why import is unavailable when entitlement inputs fail', () => {
    const reason = 'Unable to verify your library limit. Please try again.';
    render(
      <EmptyLibraryStartScreen
        variant='onboarding'
        onImport={mockOnImport}
        importDisabled
        importDisabledReason={reason}
      />,
    );

    const importButton = screen.getByTestId('empty-library-import-btn') as HTMLButtonElement;
    expect(importButton.disabled).toBe(true);
    expect(importButton.getAttribute('aria-describedby')).toBe('empty-library-import-status');
    expect(screen.getByRole('status').textContent).toBe(reason);
  });

  it('calls handlers for import and onboarding dismissal', () => {
    render(
      <EmptyLibraryStartScreen
        variant='onboarding'
        onImport={mockOnImport}
        onDismissOnboarding={mockOnDismiss}
      />,
    );

    screen.getByTestId('empty-library-import-btn').click();
    screen.getByTestId('empty-library-dismiss-btn').click();

    expect(mockOnImport).toHaveBeenCalledTimes(1);
    expect(mockOnDismiss).toHaveBeenCalledTimes(1);
  });
});
