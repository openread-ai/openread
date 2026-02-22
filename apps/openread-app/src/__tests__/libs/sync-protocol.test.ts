import { describe, it, expect, vi } from 'vitest';
import {
  validateProtocolVersion,
  SYNC_PROTOCOL_VERSION,
  SYNC_PROTOCOL_MIN_SUPPORTED,
  SYNC_PROTOCOL_MAX_SUPPORTED,
  SYNC_PROTOCOL_GRACE_PERIOD_END,
} from '@/libs/sync-protocol';

describe('validateProtocolVersion', () => {
  it('should accept valid version header', () => {
    expect(validateProtocolVersion('1')).toBeNull();
  });

  it('should reject NaN header (garbage string)', () => {
    const result = validateProtocolVersion('abc');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('PROTOCOL_VERSION_UNSUPPORTED');
  });

  it('should reject version below minimum after grace period', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01'));
    const result = validateProtocolVersion(null);
    expect(result).not.toBeNull();
    expect(result!.code).toBe('PROTOCOL_VERSION_UNSUPPORTED');
    vi.useRealTimers();
  });

  it('should reject version above maximum', () => {
    const result = validateProtocolVersion('999');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('PROTOCOL_VERSION_UNSUPPORTED');
    expect(result!.clientVersion).toBe(999);
  });

  it('should allow missing header during grace period', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01'));
    expect(validateProtocolVersion(null)).toBeNull();
    expect(validateProtocolVersion(undefined)).toBeNull();
    vi.useRealTimers();
  });

  it('should reject missing header after grace period', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01'));
    const result = validateProtocolVersion(null);
    expect(result).not.toBeNull();
    vi.useRealTimers();
  });

  it('should reject empty string header after grace period', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01'));
    const result = validateProtocolVersion('');
    expect(result).not.toBeNull();
    vi.useRealTimers();
  });

  it('should export correct constants', () => {
    expect(SYNC_PROTOCOL_VERSION).toBe(1);
    expect(SYNC_PROTOCOL_MIN_SUPPORTED).toBe(1);
    expect(SYNC_PROTOCOL_MAX_SUPPORTED).toBe(1);
    expect(SYNC_PROTOCOL_GRACE_PERIOD_END).toBeInstanceOf(Date);
  });
});
