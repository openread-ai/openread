import { describe, expect, it, vi } from 'vitest';

describe('i18n bootstrap', () => {
  it('publishes the i18n instance before translation hooks can render', async () => {
    vi.resetModules();
    const reactI18next = await import('react-i18next');
    expect(reactI18next.getI18n()).toBeUndefined();

    const { default: i18n } = await import('@/i18n/i18n');
    const { renderHook } = await import('@testing-library/react');
    const { useTranslation } = await import('@/hooks/useTranslation');

    expect(reactI18next.getI18n()).toBe(i18n);
    const { result, rerender } = renderHook(() => useTranslation());
    expect(result.current('Explore')).toBe('Explore');
    expect(() => rerender()).not.toThrow();
  });
});
