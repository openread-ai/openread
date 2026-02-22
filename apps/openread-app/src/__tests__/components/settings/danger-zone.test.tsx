import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DangerZone } from '@/components/settings/danger-zone';

// Mock useTranslation
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

// Mock useUserActions
const mockHandleLogout = vi.fn();
const mockHandleConfirmDelete = vi.fn().mockResolvedValue(undefined);

vi.mock('@/hooks/useUserActions', () => ({
  useUserActions: () => ({
    handleLogout: mockHandleLogout,
    handleConfirmDelete: mockHandleConfirmDelete,
  }),
}));

describe('DangerZone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should render the Danger Zone title', () => {
      render(<DangerZone />);
      expect(screen.getByText('Danger Zone')).toBeTruthy();
    });

    it('should render Sign Out button', () => {
      render(<DangerZone />);
      const signOutButtons = screen.getAllByRole('button', { name: /sign out/i });
      expect(signOutButtons.length).toBeGreaterThan(0);
    });

    it('should render Delete Account button', () => {
      render(<DangerZone />);
      const deleteButtons = screen.getAllByRole('button', { name: /delete account/i });
      expect(deleteButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Delete Confirmation Dialog', () => {
    it('should show confirmation dialog when Delete Account is clicked', () => {
      render(<DangerZone />);

      // Find the Delete Account button in the card (not dialog)
      const deleteButtons = screen.getAllByText('Delete Account');
      const cardDeleteButton = deleteButtons.find((el) => el.closest('button'));
      fireEvent.click(cardDeleteButton!);

      expect(screen.getByText('Are you absolutely sure?')).toBeTruthy();
    });

    it('should display IAP cancellation warning in the delete dialog', () => {
      render(<DangerZone />);

      // Open the dialog
      const deleteButtons = screen.getAllByText('Delete Account');
      const cardDeleteButton = deleteButtons.find((el) => el.closest('button'));
      fireEvent.click(cardDeleteButton!);

      // Check for the IAP warning message
      expect(
        screen.getByText(
          'If you have an active Apple App Store or Google Play subscription, please cancel it in your device settings to avoid future charges. We cannot cancel app store subscriptions on your behalf.',
        ),
      ).toBeTruthy();
    });

    it('should display the standard deletion warning in the dialog', () => {
      render(<DangerZone />);

      // Open the dialog
      const deleteButtons = screen.getAllByText('Delete Account');
      const cardDeleteButton = deleteButtons.find((el) => el.closest('button'));
      fireEvent.click(cardDeleteButton!);

      expect(
        screen.getByText(
          'This action cannot be undone. This will permanently delete your account and remove all your data from our servers.',
        ),
      ).toBeTruthy();
    });

    it('should show Cancel button in the dialog', () => {
      render(<DangerZone />);

      // Open the dialog
      const deleteButtons = screen.getAllByText('Delete Account');
      const cardDeleteButton = deleteButtons.find((el) => el.closest('button'));
      fireEvent.click(cardDeleteButton!);

      expect(screen.getByText('Cancel')).toBeTruthy();
    });
  });

  describe('Delete Confirmation Action (FIX-20-28)', () => {
    it('should call handleConfirmDelete when confirmation button is clicked', async () => {
      render(<DangerZone />);

      // Open the dialog
      const deleteButtons = screen.getAllByText('Delete Account');
      const cardDeleteButton = deleteButtons.find((el) => el.closest('button'));
      fireEvent.click(cardDeleteButton!);

      // Find and click the confirmation "Delete Account" button inside the dialog
      // The dialog footer has the AlertDialogAction with "Delete Account"
      const dialogButtons = screen.getAllByText('Delete Account');
      // The dialog action button is the last one (inside AlertDialogAction)
      const confirmButton = dialogButtons[dialogButtons.length - 1];
      fireEvent.click(confirmButton!);

      expect(mockHandleConfirmDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe('Sign Out', () => {
    it('should call handleLogout when Sign Out button is clicked', () => {
      render(<DangerZone />);

      const signOutButtons = screen.getAllByText('Sign Out');
      const signOutButton = signOutButtons.find((el) => el.closest('button'));
      fireEvent.click(signOutButton!);

      expect(mockHandleLogout).toHaveBeenCalledTimes(1);
    });
  });
});
