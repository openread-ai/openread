'use client';

import { useState, useCallback } from 'react';
import { createLogger } from '@/utils/logger';

const logger = createLogger('clipboard');

interface UseCopyToClipboardOptions {
  /**
   * Duration in milliseconds to show the copied state
   * @default 3000
   */
  copiedDuration?: number;
}

interface UseCopyToClipboardReturn {
  /**
   * Whether the text was recently copied
   */
  isCopied: boolean;
  /**
   * Function to copy text to clipboard
   */
  copyToClipboard: (value: string) => Promise<void>;
}

/**
 * Hook for copying text to clipboard with feedback state
 *
 * @example
 * ```tsx
 * const { isCopied, copyToClipboard } = useCopyToClipboard();
 *
 * return (
 *   <button onClick={() => copyToClipboard('Hello')}>
 *     {isCopied ? 'Copied!' : 'Copy'}
 *   </button>
 * );
 * ```
 */
export function useCopyToClipboard({
  copiedDuration = 3000,
}: UseCopyToClipboardOptions = {}): UseCopyToClipboardReturn {
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const copyToClipboard = useCallback(
    async (value: string) => {
      if (!value) return;

      try {
        await navigator.clipboard.writeText(value);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), copiedDuration);
      } catch (error) {
        logger.error('Failed to copy to clipboard:', error);
      }
    },
    [copiedDuration],
  );

  return { isCopied, copyToClipboard };
}
