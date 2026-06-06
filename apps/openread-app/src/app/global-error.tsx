'use client';

import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';
import { useEffect } from 'react';

const qaAutomationEnabled = process.env.NEXT_PUBLIC_OPENREAD_QA_AUTOMATION === '1';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

function qaErrorDetail(error: Error & { digest?: string }) {
  return [error.name, error.message, error.stack, error.digest].filter(Boolean).join('\n');
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const detail = qaErrorDetail(error);

  useEffect(() => {
    // Capture in both Sentry and PostHog
    Sentry.captureException(error);
    posthog.captureException(error);

    if (!qaAutomationEnabled) return;
    try {
      localStorage.setItem('openread_qa_last_error', detail);
    } catch {
      // Ignore storage failures; this is QA diagnostics only.
    }
  }, [detail, error]);

  return (
    <html lang='en'>
      <body>
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          {qaAutomationEnabled && (
            <pre
              data-openread-qa-error='true'
              style={{
                margin: '1rem auto',
                maxHeight: '50vh',
                maxWidth: '64rem',
                overflow: 'auto',
                padding: '1rem',
                textAlign: 'left',
                whiteSpace: 'pre-wrap',
              }}
            >
              {detail}
            </pre>
          )}
          <button
            onClick={() => reset()}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
