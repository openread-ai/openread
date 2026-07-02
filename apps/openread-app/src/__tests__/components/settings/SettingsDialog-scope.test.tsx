import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import SettingsDialog from '@/components/settings/SettingsDialog';
import { useSettingsStore } from '@/store/settingsStore';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: () => 16,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: { isMobile: true } }),
}));

vi.mock('@/components/command-palette', () => ({
  useCommandPalette: () => ({ open: vi.fn() }),
}));

vi.mock('@/components/Dialog', () => ({
  default: ({ children, header }: { children: React.ReactNode; header: React.ReactNode }) => (
    <div role='dialog'>
      {header}
      {children}
    </div>
  ),
}));

vi.mock('@/components/Dropdown', () => ({
  default: ({ children, label }: { children: React.ReactNode; label: string }) => (
    <div>
      <button aria-label={label} type='button' />
      {children}
    </div>
  ),
}));

vi.mock('@/components/settings/DialogMenu', () => ({
  default: ({ showReset }: { showReset?: boolean }) => (
    <div data-show-reset={String(showReset)} data-testid='settings-dialog-menu' />
  ),
}));

vi.mock('@/components/settings/FontPanel', () => ({
  default: () => <div>Font panel</div>,
}));

vi.mock('@/components/settings/LayoutPanel', () => ({
  default: () => <div>Layout panel</div>,
}));

vi.mock('@/components/settings/ColorPanel', () => ({
  default: () => <div>Color panel</div>,
}));

vi.mock('@/components/settings/ControlPanel', () => ({
  default: () => <div>Control panel</div>,
}));

vi.mock('@/components/settings/LangPanel', () => ({
  default: () => <div>Language panel</div>,
}));

vi.mock('@/components/settings/MiscPanel', () => ({
  default: () => <div>Custom panel</div>,
}));

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

vi.stubGlobal('ResizeObserver', MockResizeObserver);

describe('SettingsDialog scoped entry modes', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      settingsDialogScope: 'all',
      initialSettingsPanel: null,
      activeSettingsItemId: null,
      fontPanelView: 'main-fonts',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('preserves full settings tabs for default/full-scope entry points', () => {
    localStorage.setItem('lastConfigPanel', 'Language');

    const { container } = render(<SettingsDialog bookKey='book-1' />);
    const tabs = screen.getByRole('group', { name: /Settings Panels - Language/ });

    expect(tabs).toBeTruthy();
    expect(container.querySelector('[data-tab="Font"]')).toBeTruthy();
    expect(container.querySelector('[data-tab="Layout"]')).toBeTruthy();
    expect(container.querySelector('[data-tab="Color"]')).toBeTruthy();
    expect(container.querySelector('[data-tab="Control"]')).toBeTruthy();
    expect(container.querySelector('[data-tab="Language"]')).toBeTruthy();
    expect(container.querySelector('[data-tab="Custom"]')).toBeTruthy();
    expect(container.querySelector('[data-tab="Language"]')?.className).toContain('btn-active');
    expect(screen.getByTestId('settings-dialog-menu').dataset.showReset).toBe('true');
  });

  it('limits appearance scope to Font, Layout, and Color with Font selected first', () => {
    localStorage.setItem('lastConfigPanel', 'Language');
    useSettingsStore.setState({
      settingsDialogScope: 'appearance',
      initialSettingsPanel: 'Font',
    });

    const { container } = render(<SettingsDialog bookKey='book-1' />);
    const tabs = screen.getByRole('group', { name: /Settings Panels - Font/ });

    expect(tabs).toBeTruthy();
    expect(container.querySelector('[data-tab="Font"]')).toBeTruthy();
    expect(container.querySelector('[data-tab="Layout"]')).toBeTruthy();
    expect(container.querySelector('[data-tab="Color"]')).toBeTruthy();
    expect(container.querySelector('[data-tab="Control"]')).toBeNull();
    expect(container.querySelector('[data-tab="Language"]')).toBeNull();
    expect(container.querySelector('[data-tab="Custom"]')).toBeNull();
    expect(container.querySelector('[data-tab="Font"]')?.className).toContain('btn-active');
    expect(screen.getByRole('group', { name: /Font - Settings/ })).toBeTruthy();
    expect(screen.getByTestId('settings-dialog-menu').dataset.showReset).toBe('false');
  });
});
