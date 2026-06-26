import { describe, expect, test } from 'vitest';
import { findSectionIdentityIndex, sectionIdentitiesMatch } from '@/utils/sectionIdentity';

describe('section identity matching', () => {
  test('does not match prefix lookalikes', () => {
    expect(sectionIdentitiesMatch('ch-1', 'ch-10')).toBe(false);
    expect(sectionIdentitiesMatch('1', '10')).toBe(false);
  });

  test('matches exact identities and fragments', () => {
    expect(sectionIdentitiesMatch('ch-1', 'ch-1')).toBe(true);
    expect(sectionIdentitiesMatch('ch-1', 'ch-1#frag')).toBe(true);
    expect(sectionIdentitiesMatch('chapter.xhtml#frag', 'chapter.xhtml')).toBe(true);
  });

  test('finds the intended section without unsafe prefix matching', () => {
    const sections = [{ id: 'ch-1' }, { id: 'ch-10' }, { id: '1' }, { id: '10' }];

    expect(findSectionIdentityIndex(sections, 'ch-10#frag', (section) => [section.id])).toBe(1);
    expect(findSectionIdentityIndex(sections, '10#frag', (section) => [section.id])).toBe(3);
  });
});
