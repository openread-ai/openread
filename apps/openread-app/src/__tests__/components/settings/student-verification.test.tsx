import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { StudentVerification } from '@/components/settings/student-verification';

// Mock useTranslation
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('StudentVerification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { user_metadata: {} },
      token: 'mock-token',
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe('Verified State', () => {
    it('should show verified status when student is already verified', () => {
      mockUseAuth.mockReturnValue({
        user: { user_metadata: { student_verified: true } },
        token: 'mock-token',
      });

      render(<StudentVerification />);

      expect(screen.getByText('Student status verified')).toBeTruthy();
      expect(screen.queryByPlaceholderText('you@university.edu')).toBeNull();
    });
  });

  describe('Email Step', () => {
    it('should render the email input and verify button', () => {
      render(<StudentVerification />);

      expect(screen.getByText('Student Discount')).toBeTruthy();
      expect(screen.getByText('Verify your .edu email for student benefits')).toBeTruthy();
      expect(screen.getByPlaceholderText('you@university.edu')).toBeTruthy();
      expect(screen.getByText('Verify')).toBeTruthy();
    });

    it('should disable verify button when email is empty', () => {
      render(<StudentVerification />);

      const verifyButton = screen.getByText('Verify').closest('button');
      expect(verifyButton).toHaveProperty('disabled', true);
    });

    it('should enable verify button when email is entered', () => {
      render(<StudentVerification />);

      const input = screen.getByPlaceholderText('you@university.edu');
      fireEvent.change(input, { target: { value: 'student@mit.edu' } });

      const verifyButton = screen.getByText('Verify').closest('button');
      expect(verifyButton).toHaveProperty('disabled', false);
    });

    it('should show error message on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'A valid .edu email address is required' }),
      });

      render(<StudentVerification />);

      const input = screen.getByPlaceholderText('you@university.edu');
      fireEvent.change(input, { target: { value: 'user@gmail.com' } });

      const verifyButton = screen.getByText('Verify');
      fireEvent.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByText('A valid .edu email address is required')).toBeTruthy();
      });
    });

    it('should transition to OTP step on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ message: 'Verification code sent' }),
      });

      render(<StudentVerification />);

      const input = screen.getByPlaceholderText('you@university.edu');
      fireEvent.change(input, { target: { value: 'student@mit.edu' } });

      const verifyButton = screen.getByText('Verify');
      fireEvent.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByText('Enter the code sent to your .edu email')).toBeTruthy();
        expect(screen.getByPlaceholderText('123456')).toBeTruthy();
      });
    });

    it('should show loading state when sending code', async () => {
      let resolvePromise: (value: unknown) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockFetch.mockReturnValue(promise);

      render(<StudentVerification />);

      const input = screen.getByPlaceholderText('you@university.edu');
      fireEvent.change(input, { target: { value: 'student@mit.edu' } });

      const verifyButton = screen.getByText('Verify');
      fireEvent.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByText('Sending...')).toBeTruthy();
      });

      // Clean up
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ message: 'Verification code sent' }),
      });
    });
  });

  describe('OTP Step', () => {
    async function goToOtpStep() {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Verification code sent' }),
      });

      render(<StudentVerification />);

      const input = screen.getByPlaceholderText('you@university.edu');
      fireEvent.change(input, { target: { value: 'student@mit.edu' } });
      fireEvent.click(screen.getByText('Verify'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('123456')).toBeTruthy();
      });
    }

    it('should disable confirm button when OTP is less than 6 digits', async () => {
      await goToOtpStep();

      const otpInput = screen.getByPlaceholderText('123456');
      fireEvent.change(otpInput, { target: { value: '123' } });

      const confirmButton = screen.getByText('Confirm').closest('button');
      expect(confirmButton).toHaveProperty('disabled', true);
    });

    it('should enable confirm button when OTP is 6 digits', async () => {
      await goToOtpStep();

      const otpInput = screen.getByPlaceholderText('123456');
      fireEvent.change(otpInput, { target: { value: '123456' } });

      const confirmButton = screen.getByText('Confirm').closest('button');
      expect(confirmButton).toHaveProperty('disabled', false);
    });

    it('should show error on invalid OTP', async () => {
      await goToOtpStep();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid verification code' }),
      });

      const otpInput = screen.getByPlaceholderText('123456');
      fireEvent.change(otpInput, { target: { value: '999999' } });
      fireEvent.click(screen.getByText('Confirm'));

      await waitFor(() => {
        expect(screen.getByText('Invalid verification code')).toBeTruthy();
      });
    });

    it('should show verified state on successful confirmation', async () => {
      await goToOtpStep();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Student status verified', verified: true }),
      });

      const otpInput = screen.getByPlaceholderText('123456');
      fireEvent.change(otpInput, { target: { value: '123456' } });
      fireEvent.click(screen.getByText('Confirm'));

      await waitFor(() => {
        expect(screen.getByText('Student status verified!')).toBeTruthy();
      });
    });

    it('should show loading state when verifying', async () => {
      await goToOtpStep();

      let resolvePromise: (value: unknown) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockFetch.mockReturnValueOnce(promise);

      const otpInput = screen.getByPlaceholderText('123456');
      fireEvent.change(otpInput, { target: { value: '123456' } });
      fireEvent.click(screen.getByText('Confirm'));

      await waitFor(() => {
        expect(screen.getByText('Verifying...')).toBeTruthy();
      });

      // Clean up
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ message: 'Student status verified', verified: true }),
      });
    });
  });

  describe('API Calls', () => {
    it('should send correct request to verify-student endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Verification code sent' }),
      });

      render(<StudentVerification />);

      const input = screen.getByPlaceholderText('you@university.edu');
      fireEvent.change(input, { target: { value: 'student@mit.edu' } });
      fireEvent.click(screen.getByText('Verify'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/user/verify-student', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock-token' },
          body: JSON.stringify({ email: 'student@mit.edu' }),
        });
      });
    });

    it('should send correct request to confirm endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Verification code sent' }),
      });

      render(<StudentVerification />);

      const input = screen.getByPlaceholderText('you@university.edu');
      fireEvent.change(input, { target: { value: 'student@mit.edu' } });
      fireEvent.click(screen.getByText('Verify'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('123456')).toBeTruthy();
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Student status verified', verified: true }),
      });

      const otpInput = screen.getByPlaceholderText('123456');
      fireEvent.change(otpInput, { target: { value: '654321' } });
      fireEvent.click(screen.getByText('Confirm'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/user/verify-student/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock-token' },
          body: JSON.stringify({ otp: '654321' }),
        });
      });
    });
  });

  describe('Accessibility', () => {
    it('should have accessible labels on inputs', () => {
      render(<StudentVerification />);

      const emailInput = screen.getByLabelText('Student email address');
      expect(emailInput).toBeTruthy();
    });

    it('should have aria-hidden on decorative icons', () => {
      render(<StudentVerification />);

      const icons = document.querySelectorAll('[aria-hidden="true"]');
      expect(icons.length).toBeGreaterThan(0);
    });
  });
});
