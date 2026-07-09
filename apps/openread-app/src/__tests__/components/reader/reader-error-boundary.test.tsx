import type React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ReaderErrorBoundary from '@/app/reader/components/ReaderErrorBoundary';

const { captureExceptionMock, loggerErrorMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerErrorMock,
  }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

describe('ReaderErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
  });

  it('contains reader subtree render errors in a recoverable fallback', () => {
    const privateMarker = 'bookHash:catalog-private-title-cfi-payload';
    const thrownError = new Error(`render failed for ${privateMarker}`);

    function CrashingReaderChild(): React.ReactElement {
      throw thrownError;
    }

    render(
      <ReaderErrorBoundary onBackToLibrary={vi.fn()}>
        <CrashingReaderChild />
      </ReaderErrorBoundary>,
    );

    expect(screen.getByTestId('reader-error-boundary-fallback')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Reader ran into a problem' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to Library' })).toBeTruthy();
    expect(screen.queryByText(privateMarker)).toBeNull();

    expect(captureExceptionMock).toHaveBeenCalledWith(
      thrownError,
      expect.objectContaining({
        tags: expect.objectContaining({ boundary: 'reader-error-boundary', surface: 'reader' }),
        contexts: expect.objectContaining({
          readerErrorBoundary: { phase: 'render-or-lifecycle' },
        }),
      }),
    );
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Reader render error caught by boundary',
      expect.objectContaining({
        boundary: 'reader-error-boundary',
        surface: 'reader',
        phase: 'render-or-lifecycle',
        errorName: 'Error',
        hasComponentStack: true,
      }),
    );
    expect(JSON.stringify(loggerErrorMock.mock.calls)).not.toContain(privateMarker);
  });

  it('resets the boundary when the user tries again', () => {
    let shouldThrow = true;

    function ToggleableReaderChild(): React.ReactElement {
      if (shouldThrow) {
        throw new Error('first render failed');
      }
      return <div>Reader recovered</div>;
    }

    render(
      <ReaderErrorBoundary onBackToLibrary={vi.fn()}>
        <ToggleableReaderChild />
      </ReaderErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('Reader recovered')).toBeTruthy();
    expect(screen.queryByTestId('reader-error-boundary-fallback')).toBeNull();
  });

  it('uses the safe Back to Library escape action', () => {
    const onBackToLibrary = vi.fn();

    function CrashingReaderChild(): React.ReactElement {
      throw new Error('reader failed');
    }

    render(
      <ReaderErrorBoundary onBackToLibrary={onBackToLibrary}>
        <CrashingReaderChild />
      </ReaderErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back to Library' }));

    expect(onBackToLibrary).toHaveBeenCalledTimes(1);
  });
});
