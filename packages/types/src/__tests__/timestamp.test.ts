/**
 * Runtime tests for @openread/types/timestamp utilities.
 *
 * Covers toEpoch and toISO with valid inputs, edge cases, and error paths.
 */

import { describe, expect, it } from 'vitest';
import { toEpoch, toISO } from '../timestamp.js';

// ---------------------------------------------------------------------------
// toEpoch
// ---------------------------------------------------------------------------
describe('toEpoch', () => {
  // -- valid inputs ---------------------------------------------------------

  it('should return epoch-ms from a Date object', () => {
    const date = new Date('2024-06-15T12:00:00.000Z');
    expect(toEpoch(date)).toBe(date.getTime());
  });

  it('should return epoch-ms from an ISO 8601 string', () => {
    const iso = '2024-06-15T12:00:00.000Z';
    expect(toEpoch(iso)).toBe(new Date(iso).getTime());
  });

  it('should return the same number when given an epoch-ms number', () => {
    const epoch = 1718452800000; // 2024-06-15T12:00:00.000Z
    expect(toEpoch(epoch)).toBe(epoch);
  });

  it('should accept zero as a valid epoch (Unix epoch start)', () => {
    expect(toEpoch(0)).toBe(0);
  });

  it('should accept negative epoch values (dates before 1970)', () => {
    const epoch = -86400000; // 1969-12-31T00:00:00.000Z
    expect(toEpoch(epoch)).toBe(epoch);
  });

  it('should handle a date-only string', () => {
    const dateStr = '2024-01-01';
    expect(toEpoch(dateStr)).toBe(new Date(dateStr).getTime());
  });

  it('should handle a Date at epoch zero', () => {
    const date = new Date(0);
    expect(toEpoch(date)).toBe(0);
  });

  // -- error paths ----------------------------------------------------------

  it('should throw RangeError when input is NaN', () => {
    expect(() => toEpoch(NaN)).toThrow(RangeError);
    expect(() => toEpoch(NaN)).toThrow('toEpoch: result is not finite');
  });

  it('should throw RangeError for Infinity', () => {
    expect(() => toEpoch(Infinity)).toThrow(RangeError);
    expect(() => toEpoch(-Infinity)).toThrow(RangeError);
  });

  it('should throw RangeError for an invalid date string', () => {
    expect(() => toEpoch('not-a-date')).toThrow(RangeError);
    expect(() => toEpoch('not-a-date')).toThrow('Invalid date value');
  });

  it('should throw RangeError for an empty string', () => {
    expect(() => toEpoch('')).toThrow(RangeError);
  });

  it('should throw RangeError for an invalid Date object', () => {
    expect(() => toEpoch(new Date('invalid'))).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// toISO
// ---------------------------------------------------------------------------
describe('toISO', () => {
  // -- valid inputs ---------------------------------------------------------

  it('should return an ISO 8601 string from a valid epoch-ms', () => {
    const epoch = 1718452800000; // 2024-06-15T12:00:00.000Z
    expect(toISO(epoch)).toBe('2024-06-15T12:00:00.000Z');
  });

  it('should return the Unix epoch ISO string for 0', () => {
    expect(toISO(0)).toBe('1970-01-01T00:00:00.000Z');
  });

  it('should handle negative epoch values (dates before 1970)', () => {
    const epoch = -86400000; // one day before Unix epoch
    expect(toISO(epoch)).toBe('1969-12-31T00:00:00.000Z');
  });

  it('should return a string ending with Z (UTC)', () => {
    expect(toISO(1718452800000)).toMatch(/Z$/);
  });

  it('should produce a string parseable back to the same epoch', () => {
    const epoch = 1718452800000;
    const iso = toISO(epoch);
    expect(new Date(iso).getTime()).toBe(epoch);
  });

  // -- error paths (the NaN fix) -------------------------------------------

  it('should throw RangeError when input is NaN', () => {
    expect(() => toISO(NaN)).toThrow(RangeError);
    expect(() => toISO(NaN)).toThrow('toISO: epoch must be finite');
  });

  it('throws on Infinity', () => {
    expect(() => toISO(Infinity)).toThrow(RangeError);
  });

  it('throws on -Infinity', () => {
    expect(() => toISO(-Infinity)).toThrow(RangeError);
  });
});
