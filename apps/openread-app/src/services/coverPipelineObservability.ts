import * as Sentry from '@sentry/nextjs';
import type { BookFormat } from '@/types/book';
import { getOSPlatform } from '@/utils/misc';

export type CoverPipelineWarningReason =
  | 'extraction-empty'
  | 'extraction-threw'
  | 'svg-fallback'
  | 'upload-skipped-no-local-cover';

interface CoverPipelineWarning {
  reason: CoverPipelineWarningReason;
  format: BookFormat;
  bookHash: string;
  title: string;
  sizeBytes: number | null | undefined;
  errorName?: string;
}

function getCoverPipelinePlatform(): string {
  const osPlatform = getOSPlatform();
  if (osPlatform === 'ios' || osPlatform === 'android') return osPlatform;
  return process.env.NEXT_PUBLIC_APP_PLATFORM ?? osPlatform;
}

export function captureCoverPipelineWarning({
  reason,
  format,
  bookHash,
  title,
  sizeBytes,
  errorName,
}: CoverPipelineWarning): void {
  try {
    Sentry.captureMessage('Sideloaded cover pipeline produced no usable cover', {
      level: 'warning',
      tags: {
        reason,
        format,
        platform: getCoverPipelinePlatform(),
      },
      extra: {
        book_hash: bookHash,
        title,
        size_bytes: sizeBytes ?? null,
        ...(errorName === undefined ? {} : { error_name: errorName }),
      },
    });
  } catch {
    // Observability must never change import or sync behavior.
  }
}
