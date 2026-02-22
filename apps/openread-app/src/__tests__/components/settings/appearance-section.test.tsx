import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AppearanceSection } from '@/components/settings/appearance-section';

// Mock useTranslation
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

// Mock theme store
const mockSetThemeMode = vi.fn();
const mockSetThemeColor = vi.fn();
let mockThemeMode = 'auto';
let mockThemeColor = 'default';
let mockIsDarkMode = false;

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({
    themeMode: mockThemeMode,
    themeColor: mockThemeColor,
    isDarkMode: mockIsDarkMode,
    setThemeMode: mockSetThemeMode,
    setThemeColor: mockSetThemeColor,
  }),
}));

// Mock themes
vi.mock('@/styles/themes', () => ({
  themes: [
    {
      name: 'default',
      label: 'Default',
      colors: {
        light: { 'base-100': '#ffffff', 'base-content': '#000000' },
        dark: { 'base-100': '#1a1a1a', 'base-content': '#ffffff' },
      },
    },
    {
      name: 'sepia',
      label: 'Sepia',
      colors: {
        light: { 'base-100': '#f4ecd8', 'base-content': '#5b4636' },
        dark: { 'base-100': '#3b3226', 'base-content': '#f4ecd8' },
      },
    },
  ],
}));

describe('AppearanceSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThemeMode = 'auto';
    mockThemeColor = 'default';
    mockIsDarkMode = false;
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should render the Appearance title', () => {
      render(<AppearanceSection />);
      expect(screen.getByText('Appearance')).toBeTruthy();
    });

    it('should render the description', () => {
      render(<AppearanceSection />);
      expect(screen.getByText('Customize how OpenRead looks')).toBeTruthy();
    });

    it('should render Theme Mode label', () => {
      render(<AppearanceSection />);
      expect(screen.getByText('Theme Mode')).toBeTruthy();
    });

    it('should render all theme mode options', () => {
      render(<AppearanceSection />);
      expect(screen.getByText('Light')).toBeTruthy();
      expect(screen.getByText('Dark')).toBeTruthy();
      expect(screen.getByText('System')).toBeTruthy();
    });

    it('should render Theme Color label', () => {
      render(<AppearanceSection />);
      expect(screen.getByText('Theme Color')).toBeTruthy();
    });

    it('should render theme color options', () => {
      render(<AppearanceSection />);
      expect(screen.getByTitle('Default')).toBeTruthy();
      expect(screen.getByTitle('Sepia')).toBeTruthy();
    });
  });

  describe('Theme Mode Selection', () => {
    it('should call setThemeMode when Light is clicked', () => {
      render(<AppearanceSection />);
      const lightButton = screen.getByText('Light').closest('button');
      fireEvent.click(lightButton!);
      expect(mockSetThemeMode).toHaveBeenCalledWith('light');
    });

    it('should call setThemeMode when Dark is clicked', () => {
      render(<AppearanceSection />);
      const darkButton = screen.getByText('Dark').closest('button');
      fireEvent.click(darkButton!);
      expect(mockSetThemeMode).toHaveBeenCalledWith('dark');
    });

    it('should call setThemeMode when System is clicked', () => {
      render(<AppearanceSection />);
      const systemButton = screen.getByText('System').closest('button');
      fireEvent.click(systemButton!);
      expect(mockSetThemeMode).toHaveBeenCalledWith('auto');
    });

    it('should highlight active theme mode', () => {
      mockThemeMode = 'dark';
      render(<AppearanceSection />);
      const darkButton = screen.getByText('Dark').closest('button');
      expect(darkButton?.className).toContain('border-primary');
    });
  });

  describe('Theme Color Selection', () => {
    it('should call setThemeColor when a color is clicked', () => {
      render(<AppearanceSection />);
      const sepiaButton = screen.getByTitle('Sepia');
      fireEvent.click(sepiaButton);
      expect(mockSetThemeColor).toHaveBeenCalledWith('sepia');
    });

    it('should highlight active theme color', () => {
      mockThemeColor = 'sepia';
      render(<AppearanceSection />);
      const sepiaButton = screen.getByTitle('Sepia');
      expect(sepiaButton.className).toContain('ring-primary');
    });
  });
});
