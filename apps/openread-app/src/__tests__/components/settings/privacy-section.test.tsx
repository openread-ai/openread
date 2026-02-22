import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PrivacySection } from '@/components/settings/privacy-section';

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
let mockTelemetryEnabled = true;

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: {
      telemetryEnabled: mockTelemetryEnabled,
    },
    setSettings: mockSetSettings,
    saveSettings: mockSaveSettings,
  }),
}));

describe('PrivacySection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTelemetryEnabled = true;
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should render the Privacy title', () => {
      render(<PrivacySection />);
      expect(screen.getByText('Privacy')).toBeTruthy();
    });

    it('should render the description', () => {
      render(<PrivacySection />);
      expect(screen.getByText('Control your data and privacy settings')).toBeTruthy();
    });

    it('should render Usage Analytics toggle', () => {
      render(<PrivacySection />);
      expect(screen.getByText('Usage Analytics')).toBeTruthy();
    });

    it('should render analytics description', () => {
      render(<PrivacySection />);
      expect(
        screen.getByText('Help improve OpenRead by sharing anonymous usage data'),
      ).toBeTruthy();
    });

    it('should render Your Data section', () => {
      render(<PrivacySection />);
      expect(screen.getByText('Your Data')).toBeTruthy();
    });

    it('should render Download My Data button', () => {
      render(<PrivacySection />);
      expect(screen.getByRole('button', { name: /download my data/i })).toBeTruthy();
    });

    it('should render Clear Local Preferences button', () => {
      render(<PrivacySection />);
      expect(screen.getByRole('button', { name: /clear local preferences/i })).toBeTruthy();
    });
  });

  describe('Analytics Toggle', () => {
    it('should render toggle in checked state when telemetry is enabled', () => {
      mockTelemetryEnabled = true;
      render(<PrivacySection />);
      const toggle = screen.getByRole('checkbox');
      expect(toggle).toHaveProperty('checked', true);
    });

    it('should call setSettings when toggle is clicked', () => {
      render(<PrivacySection />);
      const toggle = screen.getByRole('checkbox');
      fireEvent.click(toggle);
      expect(mockSetSettings).toHaveBeenCalled();
    });
  });

  describe('Clear Preferences Dialog', () => {
    it('should open dialog when Clear Local Preferences is clicked', () => {
      render(<PrivacySection />);
      const clearButton = screen.getByRole('button', { name: /clear local preferences/i });
      fireEvent.click(clearButton);

      expect(screen.getByRole('alertdialog')).toBeTruthy();
      expect(screen.getByText('Clear Local Preferences?')).toBeTruthy();
    });

    it('should show warning message in dialog', () => {
      render(<PrivacySection />);
      const clearButton = screen.getByRole('button', { name: /clear local preferences/i });
      fireEvent.click(clearButton);

      expect(screen.getByText(/This will clear your locally stored preferences/)).toBeTruthy();
    });

    it('should have Cancel button in dialog', () => {
      render(<PrivacySection />);
      const clearButton = screen.getByRole('button', { name: /clear local preferences/i });
      fireEvent.click(clearButton);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
    });

    it('should close dialog when Cancel is clicked', () => {
      render(<PrivacySection />);
      const clearButton = screen.getByRole('button', { name: /clear local preferences/i });
      fireEvent.click(clearButton);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
  });

  describe('Export Data', () => {
    it('should show "Download My Data" as button text', () => {
      render(<PrivacySection />);
      expect(screen.getByRole('button', { name: /download my data/i })).toBeTruthy();
    });

    it('should show updated help text for download', () => {
      render(<PrivacySection />);
      expect(screen.getByText(/Download My Data exports all your cloud data/i)).toBeTruthy();
    });
  });
});
