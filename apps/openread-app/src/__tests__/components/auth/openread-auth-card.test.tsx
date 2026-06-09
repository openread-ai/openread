import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FcGoogle } from 'react-icons/fc';

vi.mock('@/components/LegalLinks', () => ({
  default: () => <span>Terms and Privacy</span>,
}));

import { OpenReadAuthCard } from '@/components/auth/openread-auth-card';

const providers = [
  {
    id: 'google',
    label: 'Continue with Google',
    Icon: FcGoogle,
    onClick: vi.fn(),
  },
];

describe('OpenReadAuthCard', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the minimal OpenRead login card and Google provider action', () => {
    render(
      <OpenReadAuthCard
        providers={providers}
        onEmailPassword={vi.fn()}
        onPasswordReset={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    expect(screen.getByText('Sign in to continue with OpenRead.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /magic link/i })).toBeNull();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('submits email/password sign in through the injected handler', async () => {
    const onEmailPassword = vi.fn();
    render(
      <OpenReadAuthCard
        providers={providers}
        onEmailPassword={onEmailPassword}
        onPasswordReset={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'reader@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(onEmailPassword).toHaveBeenCalledWith('sign-in', 'reader@example.com', 'password123');
    });
  });

  it('keeps password reset wired to the current email value', async () => {
    const onPasswordReset = vi.fn(async () => ({ message: 'Reset sent.' }));
    render(
      <OpenReadAuthCard
        providers={providers}
        onEmailPassword={vi.fn()}
        onPasswordReset={onPasswordReset}
      />,
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'reader@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

    await waitFor(() => {
      expect(onPasswordReset).toHaveBeenCalledWith('reader@example.com');
    });
  });

  it('can render directly in account creation mode', () => {
    render(
      <OpenReadAuthCard
        initialMode='sign-up'
        providers={providers}
        onEmailPassword={vi.fn()}
        onPasswordReset={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeTruthy();
    expect(screen.getByText('Create your OpenRead account to continue.')).toBeTruthy();
  });

  it('switches to account creation and enforces safer signup passwords', async () => {
    const onEmailPassword = vi.fn();
    render(
      <OpenReadAuthCard
        providers={providers}
        onEmailPassword={onEmailPassword}
        onPasswordReset={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeTruthy();
    expect(screen.getByText('Create your OpenRead account to continue.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'reader@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Password must be at least 8 characters.');
    expect(onEmailPassword).not.toHaveBeenCalled();
  });
});
