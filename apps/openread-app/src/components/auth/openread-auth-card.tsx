'use client';

import { FormEvent, type ElementType, useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';

import LegalLinks from '@/components/LegalLinks';
import { Button } from '@/components/primitives/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { cn } from '@/utils/tailwind';

export type AuthCardMode = 'sign-in' | 'sign-up';
export type AuthCardAction = 'credentials' | 'password-reset' | `provider:${string}`;

export interface AuthActionResult {
  message?: string;
}

export interface AuthProviderAction {
  id: string;
  label: string;
  Icon: ElementType;
  onClick: () => Promise<void> | void;
}

interface OpenReadAuthCardProps {
  className?: string;
  initialMode?: AuthCardMode;
  providers: AuthProviderAction[];
  onEmailPassword: (
    mode: AuthCardMode,
    email: string,
    password: string,
  ) => Promise<AuthActionResult | void> | AuthActionResult | void;
  onPasswordReset: (email: string) => Promise<AuthActionResult | void> | AuthActionResult | void;
}

function getActionLabel(action: AuthCardAction, mode: AuthCardMode) {
  if (action === 'credentials') return mode === 'sign-up' ? 'Creating account...' : 'Signing in...';
  if (action === 'password-reset') return 'Sending reset link...';
  return 'Opening provider...';
}

export function OpenReadAuthCard({
  className,
  initialMode = 'sign-in',
  providers,
  onEmailPassword,
  onPasswordReset,
}: OpenReadAuthCardProps) {
  const [mode, setMode] = useState<AuthCardMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pendingAction, setPendingAction] = useState<AuthCardAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === 'sign-up';
  const busyLabel = useMemo(
    () => (pendingAction ? getActionLabel(pendingAction, mode) : null),
    [mode, pendingAction],
  );
  const isBusy = pendingAction !== null;

  const runAction = async (
    action: AuthCardAction,
    callback: () => Promise<AuthActionResult | void> | AuthActionResult | void,
  ) => {
    setError(null);
    setMessage(null);
    setPendingAction(action);

    try {
      const result = await callback();
      if (result?.message) setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
    } finally {
      setPendingAction(null);
    }
  };

  const handleCredentials = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSignUp && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    void runAction('credentials', () => onEmailPassword(mode, email, password));
  };

  const handlePasswordReset = () => {
    if (!email) {
      setError('Enter your email first.');
      return;
    }
    void runAction('password-reset', () => onPasswordReset(email));
  };

  return (
    <section className={cn('flex w-full max-w-md flex-col gap-5', className)}>
      <Card className='border-base-300/80 bg-base-100/95 shadow-base-content/10 shadow-2xl backdrop-blur'>
        <CardHeader className='items-center gap-3 pb-5 text-center'>
          <div className='from-primary to-secondary text-primary-content flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg'>
            <BookOpen aria-hidden='true' className='size-6' strokeWidth={1.6} />
          </div>
          <div className='space-y-2'>
            <CardTitle aria-level={1} className='text-2xl' role='heading'>
              {isSignUp ? 'Create an account' : 'Welcome back'}
            </CardTitle>
            <CardDescription className='text-sm leading-6'>
              {isSignUp
                ? 'Create your OpenRead account to continue.'
                : 'Sign in to continue with OpenRead.'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className='space-y-5'>
          <div className='grid gap-2'>
            {providers.map(({ id, label, Icon, onClick }) => (
              <Button
                aria-label={label}
                className='h-11 w-full justify-center rounded-xl'
                disabled={isBusy}
                key={id}
                onClick={() => void runAction(`provider:${id}`, onClick)}
                type='button'
                variant='outline'
              >
                <Icon aria-hidden='true' className='size-4' />
                {pendingAction === `provider:${id}` ? busyLabel : label}
              </Button>
            ))}
          </div>

          <div className='text-base-content/50 flex items-center gap-3 text-sm'>
            <span aria-hidden='true' className='bg-base-300 h-px flex-1' />
            <span className='whitespace-nowrap'>Or use email</span>
            <span aria-hidden='true' className='bg-base-300 h-px flex-1' />
          </div>

          <form className='grid gap-4' onSubmit={handleCredentials}>
            <div className='grid gap-2'>
              <Label htmlFor='auth-email'>Email</Label>
              <Input
                aria-describedby={error ? 'auth-error' : message ? 'auth-message' : undefined}
                aria-invalid={Boolean(error)}
                autoComplete='email'
                disabled={isBusy}
                id='auth-email'
                inputMode='email'
                name='email'
                onChange={(event) => setEmail(event.target.value)}
                placeholder='you@example.com'
                required
                type='email'
                value={email}
              />
            </div>

            <div className='grid gap-2'>
              <div className='flex items-center justify-between gap-3'>
                <Label htmlFor='auth-password'>Password</Label>
                {!isSignUp ? (
                  <button
                    className='text-primary text-xs underline-offset-4 hover:underline disabled:opacity-50'
                    disabled={isBusy}
                    onClick={handlePasswordReset}
                    type='button'
                  >
                    Forgot password?
                  </button>
                ) : null}
              </div>
              <Input
                aria-describedby={error ? 'auth-error' : message ? 'auth-message' : undefined}
                aria-invalid={Boolean(error)}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                disabled={isBusy}
                id='auth-password'
                name='password'
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isSignUp ? 'Create a password' : 'Enter your password'}
                required
                type='password'
                value={password}
              />
            </div>

            <Button className='h-11 w-full rounded-xl' disabled={isBusy} type='submit'>
              {pendingAction === 'credentials'
                ? busyLabel
                : isSignUp
                  ? 'Create account'
                  : 'Sign in'}
            </Button>
          </form>

          <div className='grid gap-3'>
            {error ? (
              <p
                className='border-error/30 bg-error/10 text-error rounded-lg border px-3 py-2 text-sm'
                id='auth-error'
                role='alert'
              >
                {error}
              </p>
            ) : null}
            {message ? (
              <p
                className='border-success/30 bg-success/10 text-success rounded-lg border px-3 py-2 text-sm'
                id='auth-message'
              >
                {message}
              </p>
            ) : null}
          </div>

          <p className='text-base-content/65 text-center text-sm'>
            {isSignUp ? 'Already have an account?' : 'New to OpenRead?'}{' '}
            <button
              className='text-primary font-medium underline-offset-4 hover:underline disabled:opacity-50'
              disabled={isBusy}
              onClick={() => {
                setMode(isSignUp ? 'sign-in' : 'sign-up');
                setError(null);
                setMessage(null);
              }}
              type='button'
            >
              {isSignUp ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </CardContent>
      </Card>

      <p className='text-base-content/55 text-center text-xs leading-5'>
        By continuing, you agree to our
        <br />
        <LegalLinks />
      </p>
    </section>
  );
}
