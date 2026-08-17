import { describe, expect, it } from 'vitest';
import { resolveStripePublishableKey } from '@/libs/payment/stripe/client';

describe('Stripe client key configuration', () => {
  it.each([
    ['test', 'pk_test_preview'],
    ['live', 'pk_live_production'],
  ])('accepts a canonical %s-mode publishable key', (keyMode, key) => {
    expect(
      resolveStripePublishableKey({
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: key,
        NEXT_PUBLIC_STRIPE_KEY_MODE: keyMode,
      }),
    ).toBe(key);
  });

  it('fails closed when the canonical publishable key is absent', () => {
    expect(() => resolveStripePublishableKey({ NEXT_PUBLIC_STRIPE_KEY_MODE: 'test' })).toThrow(
      /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/,
    );
  });

  it('fails closed when the injected key mode is absent', () => {
    expect(() =>
      resolveStripePublishableKey({
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_preview',
      }),
    ).toThrow(/NEXT_PUBLIC_STRIPE_KEY_MODE/);
  });

  it.each([
    ['test', 'pk_live_production'],
    ['live', 'pk_test_preview'],
  ])('rejects a key from the wrong mode when %s mode is required', (keyMode, key) => {
    expect(() =>
      resolveStripePublishableKey({
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: key,
        NEXT_PUBLIC_STRIPE_KEY_MODE: keyMode,
      }),
    ).toThrow(new RegExp(`${keyMode}-mode`));
  });

  it.each([
    'sk_test_must_not_be_public',
    'pk_test_with whitespace',
    'pk_test_one,pk_test_two',
    Buffer.from('pk_test_encoded').toString('base64'),
  ])('rejects invalid public configuration', (key) => {
    expect(() =>
      resolveStripePublishableKey({
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: key,
        NEXT_PUBLIC_STRIPE_KEY_MODE: 'test',
      }),
    ).toThrow(/publishable key/);
  });
});
