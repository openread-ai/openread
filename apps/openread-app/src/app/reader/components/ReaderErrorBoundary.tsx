'use client';

import * as Sentry from '@sentry/nextjs';
import React from 'react';

import { useTranslation } from '@/hooks/useTranslation';
import { createLogger } from '@/utils/logger';

const logger = createLogger('reader-error-boundary');
const qaAutomationEnabled = process.env.NEXT_PUBLIC_OPENREAD_QA_AUTOMATION === '1';

type ReaderErrorBoundaryLabels = {
  title: string;
  description: string;
  tryAgain: string;
  backToLibrary: string;
};

type ReaderErrorBoundaryProps = {
  children: React.ReactNode;
  onBackToLibrary: () => void;
};

type ReaderErrorBoundaryInnerProps = ReaderErrorBoundaryProps & {
  labels: ReaderErrorBoundaryLabels;
};

type ReaderErrorBoundaryState = {
  error: Error | null;
  resetKey: number;
};

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function getQaErrorDetail(error: Error): string {
  return [error.name, error.message, error.stack].filter(Boolean).join('\n');
}

class ReaderErrorBoundaryInner extends React.Component<
  ReaderErrorBoundaryInnerProps,
  ReaderErrorBoundaryState
> {
  state: ReaderErrorBoundaryState = {
    error: null,
    resetKey: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<ReaderErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.captureException(error, {
      tags: {
        boundary: 'reader-error-boundary',
        surface: 'reader',
      },
      contexts: {
        readerErrorBoundary: {
          phase: 'render-or-lifecycle',
        },
      },
    });

    logger.error('Reader render error caught by boundary', {
      boundary: 'reader-error-boundary',
      surface: 'reader',
      phase: 'render-or-lifecycle',
      errorName: getErrorName(error),
      hasComponentStack: Boolean(errorInfo.componentStack),
    });
  }

  private handleReset = () => {
    this.setState((state) => ({ error: null, resetKey: state.resetKey + 1 }));
  };

  render() {
    if (this.state.error) {
      const { labels, onBackToLibrary } = this.props;
      const qaDetail = qaAutomationEnabled ? getQaErrorDetail(this.state.error) : '';

      return (
        <div
          className='reader-error-boundary full-height bg-base-100 text-base-content flex items-center justify-center px-6'
          data-testid='reader-error-boundary-fallback'
          role='alert'
        >
          <div className='mx-auto flex max-w-md flex-col items-center gap-4 text-center'>
            <div>
              <h1 className='text-xl font-semibold'>{labels.title}</h1>
              <p className='text-base-content/70 mt-2 text-sm'>{labels.description}</p>
            </div>
            <div className='flex flex-col gap-2 sm:flex-row'>
              <button className='btn btn-primary' onClick={this.handleReset} type='button'>
                {labels.tryAgain}
              </button>
              <button className='btn btn-ghost' onClick={onBackToLibrary} type='button'>
                {labels.backToLibrary}
              </button>
            </div>
            {qaAutomationEnabled && qaDetail && (
              <pre
                className='bg-base-200 max-h-48 w-full overflow-auto whitespace-pre-wrap rounded p-3 text-left text-xs'
                data-openread-qa-error='true'
              >
                {qaDetail}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

export default function ReaderErrorBoundary({
  children,
  onBackToLibrary,
}: ReaderErrorBoundaryProps) {
  const _ = useTranslation();
  const labels: ReaderErrorBoundaryLabels = {
    title: _('Reader ran into a problem'),
    description: _('Try again to reload the reader, or return to your Library.'),
    tryAgain: _('Try again'),
    backToLibrary: _('Back to Library'),
  };

  return (
    <ReaderErrorBoundaryInner labels={labels} onBackToLibrary={onBackToLibrary}>
      {children}
    </ReaderErrorBoundaryInner>
  );
}
