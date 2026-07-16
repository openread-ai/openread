import { describe, expect, it } from 'vitest';
import {
  CATALOG_ADD_FAILURE_CODES,
  CATALOG_ADD_REQUEST_STATES,
  CATALOG_MATERIALIZATION_FAILURE_CODES,
  CATALOG_RETRYABLE_MATERIALIZATION_FAILURE_CODES,
  CATALOG_TERMINAL_MATERIALIZATION_FAILURE_CODES,
  isCatalogAddFailureCode,
  isCatalogAddRequestState,
  isCatalogMaterializationFailureCode,
} from '../catalog.js';

const terminalCodes = [
  'SOURCE_URL_REJECTED',
  'SOURCE_REDIRECT_REJECTED',
  'SOURCE_HTTP_REJECTED',
  'SOURCE_SIZE_INVALID',
  'SOURCE_MEDIA_TYPE_INVALID',
  'SOURCE_TOO_LARGE',
  'SOURCE_SIZE_MISMATCH',
  'SOURCE_SIGNATURE_INVALID',
  'SOURCE_ARCHIVE_AMBIGUOUS',
  'SOURCE_FORMAT_MISMATCH',
  'UNSUPPORTED_SOURCE',
  'OBJECT_MISMATCH',
] as const;

describe('catalog failure contracts', () => {
  it('keeps the materialization code set exact and exhaustive', () => {
    expect(CATALOG_TERMINAL_MATERIALIZATION_FAILURE_CODES).toEqual(terminalCodes);
    expect(CATALOG_RETRYABLE_MATERIALIZATION_FAILURE_CODES).toEqual([
      'SOURCE_RATE_LIMITED',
      'SOURCE_HTTP_RETRYABLE',
      'SOURCE_FETCH_TIMEOUT',
      'MATERIALIZATION_HEARTBEAT_LOST',
      'MATERIALIZATION_OPERATIONAL_FAILURE',
    ]);
    expect(CATALOG_MATERIALIZATION_FAILURE_CODES).toEqual([
      ...terminalCodes,
      ...CATALOG_RETRYABLE_MATERIALIZATION_FAILURE_CODES,
      'MATERIALIZATION_RETRY_EXHAUSTED',
    ]);
    for (const code of CATALOG_MATERIALIZATION_FAILURE_CODES) {
      expect(isCatalogMaterializationFailureCode(code)).toBe(true);
    }
  });

  it('exposes only terminal Add meanings plus retry exhaustion and library capacity', () => {
    expect(CATALOG_ADD_FAILURE_CODES).toEqual([
      ...terminalCodes,
      'MATERIALIZATION_RETRY_EXHAUSTED',
      'LIBRARY_LIMIT_REACHED',
    ]);
    for (const code of CATALOG_ADD_FAILURE_CODES) {
      expect(isCatalogAddFailureCode(code)).toBe(true);
    }
    for (const internalCode of [
      'SOURCE_RATE_LIMITED',
      'SOURCE_HTTP_RETRYABLE',
      'SOURCE_FETCH_TIMEOUT',
      'MATERIALIZATION_HEARTBEAT_LOST',
      'MATERIALIZATION_OPERATIONAL_FAILURE',
    ]) {
      expect(isCatalogAddFailureCode(internalCode)).toBe(false);
    }
  });

  it('accepts only canonical durable Add request states', () => {
    expect(CATALOG_ADD_REQUEST_STATES).toEqual([
      'pending',
      'waiting_for_materialization',
      'finalizing',
      'completed',
      'failed',
    ]);
    for (const state of CATALOG_ADD_REQUEST_STATES) {
      expect(isCatalogAddRequestState(state)).toBe(true);
    }
    expect(isCatalogAddRequestState('unknown')).toBe(false);
    expect(isCatalogAddRequestState(null)).toBe(false);
  });

  it.each([undefined, null, '', 'UNKNOWN_CODE', 42, {}, []])(
    'rejects unknown persisted or service values: %j',
    (value) => {
      expect(isCatalogMaterializationFailureCode(value)).toBe(false);
      expect(isCatalogAddFailureCode(value)).toBe(false);
    },
  );
});
