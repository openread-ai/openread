import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnboarding } from '@/hooks/useOnboarding';

const ONBOARDING_KEY = 'openread_onboarding_completed';

describe('useOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should show onboarding when localStorage is empty', () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.showOnboarding).toBe(true);
  });

  it('should not show onboarding when localStorage has completion date', () => {
    localStorage.setItem(ONBOARDING_KEY, '2024-01-01T00:00:00.000Z');
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.showOnboarding).toBe(false);
  });

  it('should set showOnboarding to false when completeOnboarding is called', () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.showOnboarding).toBe(true);

    act(() => {
      result.current.completeOnboarding();
    });

    expect(result.current.showOnboarding).toBe(false);
  });

  it('should persist completion to localStorage when completeOnboarding is called', () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => {
      result.current.completeOnboarding();
    });

    const stored = localStorage.getItem(ONBOARDING_KEY);
    expect(stored).not.toBeNull();
    // Should be a valid ISO date string
    expect(new Date(stored!).toISOString()).toBe(stored);
  });

  it('should not show onboarding after completion even on re-render', () => {
    const { result, rerender } = renderHook(() => useOnboarding());

    act(() => {
      result.current.completeOnboarding();
    });

    rerender();
    expect(result.current.showOnboarding).toBe(false);
  });

  it('should return a stable completeOnboarding function', () => {
    const { result, rerender } = renderHook(() => useOnboarding());
    const firstRef = result.current.completeOnboarding;
    rerender();
    expect(result.current.completeOnboarding).toBe(firstRef);
  });
});
