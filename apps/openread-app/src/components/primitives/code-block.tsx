'use client';

import { CheckIcon, CopyIcon } from 'lucide-react';

import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { cn } from '@/utils/tailwind';
import { eventDispatcher } from '@/utils/event';

interface CodeBlockProps {
  /**
   * The code content to display
   */
  code: string;
  /**
   * Programming language for syntax highlighting (future use)
   */
  language?: string;
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Whether to show the copy button
   * @default true
   */
  showCopy?: boolean;
  /**
   * Maximum height of the code block
   * @default '16rem'
   */
  maxHeight?: string;
}

/**
 * A code block component with copy-to-clipboard functionality
 *
 * Uses DaisyUI styling and integrates with the app's toast system
 * for copy feedback.
 *
 * @example
 * ```tsx
 * <CodeBlock
 *   code={JSON.stringify(config, null, 2)}
 *   language="json"
 * />
 * ```
 */
export function CodeBlock({
  code,
  language = 'text',
  className,
  showCopy = true,
  maxHeight = '16rem',
}: CodeBlockProps) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({ copiedDuration: 2000 });

  const handleCopy = async () => {
    await copyToClipboard(code);
    eventDispatcher.dispatch('toast', {
      message: 'Copied to clipboard',
      type: 'success',
      timeout: 2000,
    });
  };

  return (
    <div className={cn('relative', className)}>
      <pre
        className={cn(
          'bg-base-200 overflow-auto rounded-lg p-4 text-sm',
          'font-mono leading-relaxed',
          'border-base-300 border',
        )}
        style={{ maxHeight }}
      >
        <code className={`language-${language}`}>{code}</code>
      </pre>

      {showCopy && (
        <button
          type='button'
          className={cn(
            'btn btn-ghost btn-sm btn-square',
            'absolute right-2 top-2',
            'bg-base-100/80 backdrop-blur-sm',
            'hover:bg-base-100',
          )}
          onClick={handleCopy}
          aria-label={isCopied ? 'Copied' : 'Copy to clipboard'}
          title={isCopied ? 'Copied!' : 'Copy to clipboard'}
        >
          {isCopied ? (
            <CheckIcon className='text-success h-4 w-4' />
          ) : (
            <CopyIcon className='h-4 w-4' />
          )}
        </button>
      )}
    </div>
  );
}
