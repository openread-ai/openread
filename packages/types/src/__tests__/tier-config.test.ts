import { describe, expect, it } from 'vitest';
import { evaluateLibraryLimit, getGen3V3FallbackTierConfig } from '../tier-config.js';

const config = getGen3V3FallbackTierConfig();

describe('library limit contract', () => {
  it('allows free users below the active book limit', () => {
    expect(evaluateLibraryLimit('free', config, 9)).toMatchObject({
      allowed: true,
      limit: 10,
      activeCount: 9,
      remaining: 1,
    });
  });

  it('blocks free users at the active book limit for new additions', () => {
    expect(evaluateLibraryLimit('free', config, 10)).toMatchObject({
      allowed: false,
      limit: 10,
      activeCount: 10,
      remaining: 0,
    });
  });

  it('allows paid tiers with unlimited libraries', () => {
    expect(evaluateLibraryLimit('reader', config, 10_000)).toMatchObject({
      allowed: true,
      limit: null,
      activeCount: 10_000,
      remaining: null,
    });
  });
});
