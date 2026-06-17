import { describe, expect, it } from 'vitest';
import { getGen3V3FallbackTierConfig } from '../tier-config.js';

describe('tier config contract shapes', () => {
  it('keeps library_limit as shared config data only', () => {
    const config = getGen3V3FallbackTierConfig();

    expect(config.tiers.free.library_limit).toBe(10);
    expect(config.tiers.reader.library_limit).toBeNull();
    expect(config.tiers.pro.library_limit).toBeNull();
  });
});
