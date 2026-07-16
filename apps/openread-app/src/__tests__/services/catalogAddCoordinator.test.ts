import { describe, expect, it } from 'vitest';
import { catalogAddFailureMessage } from '@/services/catalogAddCoordinator';

describe('catalogAddCoordinator failure boundary', () => {
  it.each([
    'SOURCE_SIGNATURE_INVALID',
    'SOURCE_SIZE_MISMATCH',
    'MATERIALIZATION_RETRY_EXHAUSTED',
    'LIBRARY_LIMIT_REACHED',
  ])('preserves the existing canonical Add meaning %s', (failureCode) => {
    expect(catalogAddFailureMessage(failureCode)).toBe(failureCode);
  });

  it.each([
    'MATERIALIZATION_OPERATIONAL_FAILURE',
    'MATERIALIZATION_HEARTBEAT_LOST',
    'SOURCE_FETCH_TIMEOUT',
    'UNKNOWN_CODE',
    undefined,
    null,
  ])('fails closed for non-public or unknown service values: %s', (failureCode) => {
    expect(catalogAddFailureMessage(failureCode)).toBe('Catalog Add failed');
  });
});
