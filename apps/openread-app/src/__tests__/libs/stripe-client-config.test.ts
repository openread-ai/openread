import { describe, expect, it } from 'vitest';
import { resolveStripePublishableKey } from '@/libs/payment/stripe/client';

const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64');

describe('Stripe client key configuration', () => {
  it.each([
    ['test', 'pk_test_preview'],
    ['live', 'pk_live_production'],
  ])('decodes a canonical %s-mode publishable key', (keyMode, key) => {
    expect(
      resolveStripePublishableKey({
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_BASE64: encode(key),
        NEXT_PUBLIC_STRIPE_KEY_MODE: keyMode,
      }),
    ).toBe(key);
  });

  it('fails closed when the canonical publishable key is absent', () => {
    expect(() => resolveStripePublishableKey({ NEXT_PUBLIC_STRIPE_KEY_MODE: 'test' })).toThrow(
      /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_BASE64/,
    );
  });

  it('fails closed when the injected key mode is absent', () => {
    expect(() =>
      resolveStripePublishableKey({
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_BASE64: encode('pk_test_preview'),
      }),
    ).toThrow(/NEXT_PUBLIC_STRIPE_KEY_MODE/);
  });

  it.each([
    ['test', 'pk_live_production'],
    ['live', 'pk_test_preview'],
  ])('rejects a key from the wrong mode when %s mode is required', (keyMode, key) => {
    expect(() =>
      resolveStripePublishableKey({
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_BASE64: encode(key),
        NEXT_PUBLIC_STRIPE_KEY_MODE: keyMode,
      }),
    ).toThrow(new RegExp(`${keyMode}-mode`));
  });

  it('rejects a secret key in the public canonical variable', () => {
    expect(() =>
      resolveStripePublishableKey({
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_BASE64: encode('sk_test_must_not_be_public'),
        NEXT_PUBLIC_STRIPE_KEY_MODE: 'test',
      }),
    ).toThrow(/publishable key/);
  });
});
