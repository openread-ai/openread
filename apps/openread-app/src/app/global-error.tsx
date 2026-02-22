'use client';

import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';
import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Capture in both Sentry and PostHog
    Sentry.captureException(error);
    posthog.captureException(error);
  }, [error]);

  return (
    <html lang='en'>
      <body>
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Something went wrong</h2>
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
