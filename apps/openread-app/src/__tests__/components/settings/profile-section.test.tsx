import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ProfileSection } from '@/components/settings/profile-section';
import type { User } from '@supabase/supabase-js';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: vi.fn(),
  }),
}));

// Mock useTranslation
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

// Mock user data
const mockUser: User = {
  id: 'user-123',
  email: 'john@example.com',
  app_metadata: {},
  user_metadata: {
    display_name: 'John Doe',
    full_name: 'John Doe',
    avatar_url: null,
  },
  aud: 'authenticated',
  created_at: '2024-01-01T00:00:00.000Z',
} as User;

const mockUserNoName: User = {
  id: 'user-456',
  email: 'user@example.com',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2024-01-01T00:00:00.000Z',
} as User;

// Mock AuthContext
let mockAuthUser: User | null = mockUser;

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    token: mockAuthUser ? 'mock-token' : null,
    logout: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('ProfileSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthUser = mockUser;
  });

  afterEach(() => {
    cleanup();
  });

  describe('Authenticated State', () => {
    it('should render user display name', () => {
      render(<ProfileSection />);
      expect(screen.getByText('John Doe')).toBeTruthy();
    });

    it('should render user email', () => {
      render(<ProfileSection />);
      expect(screen.getByText('john@example.com')).toBeTruthy();
    });

    it('should render Edit Profile button', () => {
      render(<ProfileSection />);
      expect(screen.getByRole('button', { name: /edit profile/i })).toBeTruthy();
    });

    it('should show "No name set" when user has no name', () => {
      mockAuthUser = mockUserNoName;
      render(<ProfileSection />);
      expect(screen.getByText('No name set')).toBeTruthy();
    });

    it('should render user avatar', () => {
      render(<ProfileSection />);
      // Avatar shows initials when no avatar URL
      expect(screen.getByText('JD')).toBeTruthy();
    });

    it('should render Profile section title', () => {
      render(<ProfileSection />);
      expect(screen.getByText('Profile')).toBeTruthy();
    });

    it('should render account information description', () => {
      render(<ProfileSection />);
      expect(screen.getByText('Your account information')).toBeTruthy();
    });

    it('should open edit dialog on Edit Profile button click', () => {
      render(<ProfileSection />);
      const editButton = screen.getByRole('button', { name: /edit profile/i });
      fireEvent.click(editButton);

      // Check that dialog is opened
      expect(screen.getByRole('dialog')).toBeTruthy();
      // The dialog title is inside a heading element
      expect(screen.getByRole('heading', { name: /edit profile/i })).toBeTruthy();
    });
  });

  describe('Unauthenticated State', () => {
    beforeEach(() => {
      mockAuthUser = null;
    });

    it('should return null when no user is authenticated', () => {
      const { container } = render(<ProfileSection />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Edit Profile Dialog', () => {
    it('should show email field as disabled', () => {
      render(<ProfileSection />);
      const editButton = screen.getByRole('button', { name: /edit profile/i });
      fireEvent.click(editButton);

      const emailInput = screen.getByLabelText('Email');
      expect(emailInput).toBeTruthy();
      expect(emailInput).toHaveProperty('disabled', true);
    });

    it('should show Full Name field', () => {
      render(<ProfileSection />);
      const editButton = screen.getByRole('button', { name: /edit profile/i });
      fireEvent.click(editButton);

      expect(screen.getByLabelText('Full Name')).toBeTruthy();
    });

    it('should have Save Changes button', () => {
      render(<ProfileSection />);
      const editButton = screen.getByRole('button', { name: /edit profile/i });
      fireEvent.click(editButton);

      expect(screen.getByRole('button', { name: /save changes/i })).toBeTruthy();
    });

    it('should have Cancel button', () => {
      render(<ProfileSection />);
      const editButton = screen.getByRole('button', { name: /edit profile/i });
      fireEvent.click(editButton);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
    });

    it('should close dialog when Cancel is clicked', () => {
      render(<ProfileSection />);
      const editButton = screen.getByRole('button', { name: /edit profile/i });
      fireEvent.click(editButton);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      // Dialog should be closed
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('should pre-fill Full Name with user display name', () => {
      render(<ProfileSection />);
      const editButton = screen.getByRole('button', { name: /edit profile/i });
      fireEvent.click(editButton);

      const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
      expect(nameInput.value).toBe('John Doe');
    });
  });
});
