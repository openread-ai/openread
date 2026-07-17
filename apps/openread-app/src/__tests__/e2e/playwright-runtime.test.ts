import { describe, expect, it } from 'vitest';
import { assertPlaywrightNodeRuntime, expectedNodeMajor } from '../../../e2e/helpers/runtime';

describe('Playwright Node runtime contract', () => {
  it('accepts the canonical Node 22 runtime', () => {
    expect(() => assertPlaywrightNodeRuntime('22.23.1', '22.x')).not.toThrow();
    expect(expectedNodeMajor('22.x')).toBe(22);
  });

  it('fails fast before Playwright teardown can run on another major', () => {
    expect(() => assertPlaywrightNodeRuntime('26.4.0', '22.x')).toThrow(
      /PLAYWRIGHT_NODE_RUNTIME_MISMATCH/,
    );
  });

  it('rejects an ambiguous runtime contract', () => {
    expect(() => expectedNodeMajor('>=22')).toThrow(/PLAYWRIGHT_NODE_RUNTIME_CONFIG_INVALID/);
  });
});
