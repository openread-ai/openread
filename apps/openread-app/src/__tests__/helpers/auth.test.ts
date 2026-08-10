import { describe, expect, it } from 'vitest';
import { safeInternalRedirect } from '@/helpers/auth';

describe('safeInternalRedirect', () => {
  it.each([
    ['/home', '/home'],
    ['/library?x=1#y', '/library?x=1#y'],
    ['/collections/../library', '/library'],
  ])('accepts and normalizes an internal path: %s', (value, expected) => {
    expect(safeInternalRedirect(value)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    '',
    ' ',
    'relative/path',
    'https://attacker.example/path',
    '//attacker.example/path',
    '/\\attacker.example/path',
    '/library\\attacker',
    '/..//attacker.com',
    '/../..//attacker.com',
    '/./..//evil.com',
    '/%2e%2e//evil.com',
    'javascript:alert(1)',
    '/library path',
    '/library\npath',
    '/library%',
  ])('rejects a non-internal redirect target: %s', (value) => {
    expect(safeInternalRedirect(value)).toBeNull();
  });
});
