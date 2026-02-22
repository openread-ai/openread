import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ProfileMenu } from '@/components/platform/profile-menu';
import { UserAvatar } from '@/components/platform/user-avatar';
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

// Mock navigateToLogin
const mockNavigateToLogin = vi.fn();
vi.mock('@/utils/nav', () => ({
  navigateToLogin: (router: unknown) => mockNavigateToLogin(router),
}));

// Mock user data
const mockUser: User = {
  id: 'user-123',
  email: 'john@example.com',
  app_metadata: {},
  user_metadata: {
    display_name: 'John Doe',
    avatar_url: null,
  },
  aud: 'authenticated',
  created_at: '2024-01-01T00:00:00.000Z',
} as User;

const mockUserWithAvatar: User = {
  ...mockUser,
  user_metadata: {
    display_name: 'Jane Smith',
    avatar_url: 'https://example.com/avatar.jpg',
  },
} as User;

const mockUserEmailOnly: User = {
  id: 'user-456',
  email: 'user@example.com',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2024-01-01T00:00:00.000Z',
} as User;

// Mock AuthContext
const mockLogout = vi.fn().mockResolvedValue(undefined);
let mockAuthUser: User | null = mockUser;

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    token: mockAuthUser ? 'mock-token' : null,
    logout: mockLogout,
    login: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('ProfileMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthUser = mockUser;
  });

  afterEach(() => {
    cleanup();
  });

  describe('Authenticated State', () => {
    it('should render user display name', () => {
      render(<ProfileMenu />);
      expect(screen.getByText('John Doe')).toBeTruthy();
    });

    it('should render user email', () => {
      render(<ProfileMenu />);
      expect(screen.getByText('john@example.com')).toBeTruthy();
    });

    it('should render profile menu button with aria-label', () => {
      render(<ProfileMenu />);
      const button = screen.getByRole('button', { name: /profile menu/i });
      expect(button).toBeTruthy();
    });

    it('should show email username when no display name is set', () => {
      mockAuthUser = mockUserEmailOnly;
      render(<ProfileMenu />);
      expect(screen.getByText('user')).toBeTruthy();
    });

    it('should have aria-haspopup attribute on trigger', () => {
      render(<ProfileMenu />);
      const button = screen.getByRole('button', { name: /profile menu/i });
      expect(button.getAttribute('aria-haspopup')).toBe('menu');
    });

    it('should show chevron icon', () => {
      const { container } = render(<ProfileMenu />);
      const chevron = container.querySelector('.lucide-chevron-up');
      expect(chevron).toBeTruthy();
    });

    it('should render user avatar with initials', () => {
      render(<ProfileMenu />);
      expect(screen.getByText('JD')).toBeTruthy();
    });

    it('should have aria-expanded attribute set to false initially', () => {
      render(<ProfileMenu />);
      const button = screen.getByRole('button', { name: /profile menu/i });
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('Unauthenticated State', () => {
    beforeEach(() => {
      mockAuthUser = null;
    });

    it('should render Sign In button when not authenticated', () => {
      render(<ProfileMenu />);
      expect(screen.getByText('Sign In')).toBeTruthy();
    });

    it('should have sign in aria-label', () => {
      render(<ProfileMenu />);
      expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
    });

    it('should not render dropdown menu when not authenticated', () => {
      render(<ProfileMenu />);
      // The sign in button should not have aria-haspopup (not a dropdown)
      const button = screen.getByRole('button', { name: /sign in/i });
      expect(button.getAttribute('aria-haspopup')).toBeNull();
    });

    it('should show user icon placeholder', () => {
      const { container } = render(<ProfileMenu />);
      const userIcon = container.querySelector('.lucide-user');
      expect(userIcon).toBeTruthy();
    });

    it('should call navigateToLogin when sign in is clicked', () => {
      render(<ProfileMenu />);
      const button = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(button);
      expect(mockNavigateToLogin).toHaveBeenCalled();
    });
  });
});

describe('UserAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Initials Display', () => {
    it('should show initials when no avatar URL', () => {
      render(<UserAvatar user={mockUser} />);
      expect(screen.getByText('JD')).toBeTruthy();
    });

    it('should show first two letters of email when no name', () => {
      render(<UserAvatar user={mockUserEmailOnly} />);
      expect(screen.getByText('US')).toBeTruthy();
    });

    it('should show question mark when no user', () => {
      render(<UserAvatar user={null} />);
      expect(screen.getByText('?')).toBeTruthy();
    });

    it('should handle single word names', () => {
      const singleNameUser: User = {
        ...mockUser,
        user_metadata: { display_name: 'Madonna' },
      } as User;
      render(<UserAvatar user={singleNameUser} />);
      expect(screen.getByText('MA')).toBeTruthy();
    });

    it('should handle names with multiple spaces', () => {
      const multiNameUser: User = {
        ...mockUser,
        user_metadata: { display_name: 'John Robert Smith Jr' },
      } as User;
      render(<UserAvatar user={multiNameUser} />);
      // Should use first and last initials
      expect(screen.getByText('JJ')).toBeTruthy();
    });

    it('should use full_name if display_name not set', () => {
      const fullNameUser: User = {
        ...mockUser,
        user_metadata: { full_name: 'Alice Cooper' },
      } as User;
      render(<UserAvatar user={fullNameUser} />);
      expect(screen.getByText('AC')).toBeTruthy();
    });
  });

  describe('Size Variants', () => {
    it('should apply small size class', () => {
      const { container } = render(<UserAvatar user={mockUser} size='sm' />);
      const avatar = container.firstChild as HTMLElement;
      expect(avatar.className).toContain('h-8');
      expect(avatar.className).toContain('w-8');
    });

    it('should apply medium size class (default)', () => {
      const { container } = render(<UserAvatar user={mockUser} />);
      const avatar = container.firstChild as HTMLElement;
      expect(avatar.className).toContain('h-10');
      expect(avatar.className).toContain('w-10');
    });

    it('should apply large size class', () => {
      const { container } = render(<UserAvatar user={mockUser} size='lg' />);
      const avatar = container.firstChild as HTMLElement;
      expect(avatar.className).toContain('h-16');
      expect(avatar.className).toContain('w-16');
    });
  });

  describe('Avatar Image', () => {
    it('should render image when avatar URL is provided', () => {
      render(<UserAvatar user={mockUserWithAvatar} />);
      const img = screen.getByRole('img');
      expect(img).toBeTruthy();
      expect(img.getAttribute('alt')).toBe('Jane Smith');
    });

    it('should not show initials when avatar URL is provided', () => {
      render(<UserAvatar user={mockUserWithAvatar} />);
      expect(screen.queryByText('JS')).toBeNull();
    });
  });

  describe('Custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(<UserAvatar user={mockUser} className='custom-class' />);
      const avatar = container.firstChild as HTMLElement;
      expect(avatar.className).toContain('custom-class');
    });
  });

  describe('Styling', () => {
    it('should have rounded-full class', () => {
      const { container } = render(<UserAvatar user={mockUser} />);
      const avatar = container.firstChild as HTMLElement;
      expect(avatar.className).toContain('rounded-full');
    });

    it('should have primary background', () => {
      const { container } = render(<UserAvatar user={mockUser} />);
      const avatar = container.firstChild as HTMLElement;
      expect(avatar.className).toContain('bg-primary');
    });
  });
});
