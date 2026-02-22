import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ResetPreferences } from '@/components/settings/reset-preferences';

// Mock useTranslation
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

// Mock EnvContext
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: {
      getDefaultViewSettings: () => ({
        defaultFont: 'Serif',
        defaultFontSize: 16,
        lineHeight: 1.5,
      }),
    },
  }),
}));

// Mock theme store
const mockSetThemeMode = vi.fn();
const mockSetThemeColor = vi.fn();

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({
    setThemeMode: mockSetThemeMode,
    setThemeColor: mockSetThemeColor,
  }),
}));

// Mock settings store
const mockSetSettings = vi.fn();
const mockSaveSettings = vi.fn();

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: {
      globalViewSettings: {
        defaultFont: 'Sans-serif',
        defaultFontSize: 20,
        lineHeight: 1.8,
      },
      aiSettings: {},
      telemetryEnabled: false,
    },
    setSettings: mockSetSettings,
    saveSettings: mockSaveSettings,
  }),
}));

// Mock DEFAULT_AI_SETTINGS
vi.mock('@/services/ai/constants', () => ({
  DEFAULT_AI_SETTINGS: {
    enabled: true,
    provider: 'ollama',
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    ollamaModel: 'llama3.2',
    ollamaEmbeddingModel: 'nomic-embed-text',
  },
}));

describe('ResetPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should render the Reset Preferences title', () => {
      render(<ResetPreferences />);
      expect(screen.getByText('Reset Preferences')).toBeTruthy();
    });

    it('should render the description', () => {
      render(<ResetPreferences />);
      expect(
        screen.getByText('Reset all preferences to their default values. This cannot be undone.'),
      ).toBeTruthy();
    });

    it('should render Reset to Defaults button', () => {
      render(<ResetPreferences />);
      expect(screen.getByRole('button', { name: /reset to defaults/i })).toBeTruthy();
    });
  });

  describe('Reset Dialog', () => {
    it('should open dialog when Reset to Defaults is clicked', () => {
      render(<ResetPreferences />);
      const resetButton = screen.getByRole('button', { name: /reset to defaults/i });
      fireEvent.click(resetButton);

      expect(screen.getByRole('alertdialog')).toBeTruthy();
      expect(screen.getByText('Reset Preferences?')).toBeTruthy();
    });

    it('should show warning message in dialog', () => {
      render(<ResetPreferences />);
      const resetButton = screen.getByRole('button', { name: /reset to defaults/i });
      fireEvent.click(resetButton);

      expect(
        screen.getByText(/This will reset all your preferences to their default values/),
      ).toBeTruthy();
    });

    it('should mention books will not be affected', () => {
      render(<ResetPreferences />);
      const resetButton = screen.getByRole('button', { name: /reset to defaults/i });
      fireEvent.click(resetButton);

      expect(screen.getByText(/Your books and reading progress will not be affected/)).toBeTruthy();
    });

    it('should have Cancel button in dialog', () => {
      render(<ResetPreferences />);
      const resetButton = screen.getByRole('button', { name: /reset to defaults/i });
      fireEvent.click(resetButton);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
    });

    it('should have Reset button in dialog', () => {
      render(<ResetPreferences />);
      const resetButton = screen.getByRole('button', { name: /reset to defaults/i });
      fireEvent.click(resetButton);

      // Find the Reset button in the dialog (different from Reset to Defaults)
      const dialogButtons = screen.getAllByRole('button');
      const resetActionButton = dialogButtons.find((btn) => btn.textContent === 'Reset');
      expect(resetActionButton).toBeTruthy();
    });

    it('should close dialog when Cancel is clicked', () => {
      render(<ResetPreferences />);
      const resetButton = screen.getByRole('button', { name: /reset to defaults/i });
      fireEvent.click(resetButton);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('should call reset functions when Reset is confirmed', async () => {
      render(<ResetPreferences />);
      const resetButton = screen.getByRole('button', { name: /reset to defaults/i });
      fireEvent.click(resetButton);

      // Find and click the Reset action button
      const dialogButtons = screen.getAllByRole('button');
      const resetActionButton = dialogButtons.find((btn) => btn.textContent === 'Reset');
      fireEvent.click(resetActionButton!);

      // Wait for async operations
      await vi.waitFor(() => {
        expect(mockSetThemeMode).toHaveBeenCalledWith('auto');
        expect(mockSetThemeColor).toHaveBeenCalledWith('default');
      });
    });
  });
});
