import { describe, expect, it } from 'vitest';
import { resolveBillingProviders } from '@/libs/payment/billing-source';

describe('resolveBillingProviders', () => {
  it('keeps Stripe ownership on native while allowing native purchase capability', () => {
    expect(
      resolveBillingProviders({
        subscriptionProvider: 'stripe',
        iapAvailable: true,
        isIOSApp: true,
      }),
    ).toEqual({
      subscriptionProvider: 'stripe',
      purchaseProvider: 'apple',
    });
  });

  it('keeps Apple ownership on web/desktop while using Stripe for new purchases', () => {
    expect(
      resolveBillingProviders({
        subscriptionProvider: 'apple',
        iapAvailable: false,
      }),
    ).toEqual({
      subscriptionProvider: 'apple',
      purchaseProvider: 'stripe',
    });
  });

  it('keeps Google ownership on web/desktop while using Stripe for new purchases', () => {
    expect(
      resolveBillingProviders({
        subscriptionProvider: 'google',
        iapAvailable: false,
      }),
    ).toEqual({
      subscriptionProvider: 'google',
      purchaseProvider: 'stripe',
    });
  });

  it('uses native provider only for free-user purchases on IAP-capable platforms', () => {
    expect(
      resolveBillingProviders({
        subscriptionProvider: null,
        iapAvailable: true,
        isIOSApp: false,
      }),
    ).toEqual({
      subscriptionProvider: null,
      purchaseProvider: 'google',
    });
  });
});
