import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReadingSection } from '@/components/settings/reading-section';

// Mock useTranslation
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

// Mock EnvContext
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: null,
  }),
}));

// Mock settings store
const mockSetSettings = vi.fn();
const mockSaveSettings = vi.fn();
const mockSettings = {
  globalViewSettings: {
    defaultFont: 'Serif',
    defaultFontSize: 16,
    lineHeight: 1.5,
  },
};

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: mockSettings,
    setSettings: mockSetSettings,
    saveSettings: mockSaveSettings,
  }),
}));

describe('ReadingSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should render the Reading title', () => {
      render(<ReadingSection />);
      expect(screen.getByText('Reading')).toBeTruthy();
    });

    it('should render the description', () => {
      render(<ReadingSection />);
      expect(screen.getByText('Customize your reading experience')).toBeTruthy();
    });

    it('should render Default Font label', () => {
      render(<ReadingSection />);
      expect(screen.getByText('Default Font')).toBeTruthy();
    });

    it('should render Font Size label', () => {
      render(<ReadingSection />);
      expect(screen.getByText('Font Size')).toBeTruthy();
    });

    it('should render Line Height label', () => {
      render(<ReadingSection />);
      expect(screen.getByText('Line Height')).toBeTruthy();
    });

    it('should render Preview section', () => {
      render(<ReadingSection />);
      expect(screen.getByText('Preview')).toBeTruthy();
    });

    it('should render preview text', () => {
      render(<ReadingSection />);
      expect(
        screen.getByText(
          'The quick brown fox jumps over the lazy dog. This is a preview of your reading settings.',
        ),
      ).toBeTruthy();
    });
  });

  describe('Default Values', () => {
    it('should display current font size', () => {
      render(<ReadingSection />);
      // The NumberInput displays the value in an input
      const fontSizeInput = screen.getByDisplayValue('16');
      expect(fontSizeInput).toBeTruthy();
    });

    it('should display current line height', () => {
      render(<ReadingSection />);
      const lineHeightInput = screen.getByDisplayValue('1.5');
      expect(lineHeightInput).toBeTruthy();
    });
  });

  describe('Font Selection', () => {
    it('should show font selector', () => {
      render(<ReadingSection />);
      // The select trigger should show the current font
      expect(screen.getByRole('combobox')).toBeTruthy();
    });
  });
});
