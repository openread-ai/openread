import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

const mockGetTierConfig = vi.fn();
vi.mock('@/lib/tier-config', () => ({
  getTierConfig: () => mockGetTierConfig(),
}));

import {
  listCanonicalStripePlans,
  resolveCanonicalStripePrice,
} from '@/libs/payment/stripe/plan-prices';

function tierConfig() {
  return {
    tiers: {
      reader: { display_price_cents: 999, display_annual_price_cents: 9999 },
      pro: { display_price_cents: 1999, display_annual_price_cents: 19999 },
    },
  };
}

function price({
  id,
  plan,
  interval,
  amount,
  currency = 'usd',
}: {
  id: string;
  plan: 'reader' | 'pro';
  interval: 'month' | 'year';
  amount: number;
  currency?: string;
}) {
  return {
    id,
    active: true,
    currency,
    type: 'recurring',
    unit_amount: amount,
    recurring: { interval },
    product: {
      id: `prod_${plan}`,
      name: `OpenRead ${plan}`,
      active: true,
      metadata: { plan },
    },
  } as unknown as Stripe.Price;
}

function stripeWithPrices(prices: Stripe.Price[]) {
  return {
    prices: {
      list: vi.fn().mockResolvedValue({ data: prices }),
    },
  } as unknown as Stripe;
}

describe('Stripe canonical plan prices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTierConfig.mockResolvedValue(tierConfig());
  });

  it('ignores active USD prices whose amounts do not match the billing contract', async () => {
    const stripe = stripeWithPrices([
      price({
        id: 'price_reader_month_discounted',
        plan: 'reader',
        interval: 'month',
        amount: 499,
      }),
      price({ id: 'price_reader_month', plan: 'reader', interval: 'month', amount: 999 }),
      price({ id: 'price_reader_year_old', plan: 'reader', interval: 'year', amount: 7999 }),
      price({ id: 'price_reader_year', plan: 'reader', interval: 'year', amount: 9999 }),
    ]);

    const plans = await listCanonicalStripePlans(stripe);

    expect(plans.map((plan) => [plan.interval, plan.productId, plan.price])).toEqual([
      ['month', 'price_reader_month', 999],
      ['year', 'price_reader_year', 9999],
    ]);
  });

  it('ignores non-USD prices even when they match plan metadata', async () => {
    const stripe = stripeWithPrices([
      price({
        id: 'price_reader_month_inr',
        plan: 'reader',
        interval: 'month',
        amount: 999,
        currency: 'inr',
      }),
      price({ id: 'price_reader_month', plan: 'reader', interval: 'month', amount: 999 }),
    ]);

    const plans = await listCanonicalStripePlans(stripe);

    expect(plans).toHaveLength(1);
    expect(plans[0]?.productId).toBe('price_reader_month');
  });

  it('rejects checkout/change resolution when no active Stripe price matches the canonical amount', async () => {
    const stripe = stripeWithPrices([
      price({ id: 'price_pro_month_wrong', plan: 'pro', interval: 'month', amount: 1499 }),
    ]);

    await expect(
      resolveCanonicalStripePrice(stripe, {
        plan: 'pro',
        interval: 'month',
        headers: new Headers(),
      }),
    ).rejects.toThrow('No active Stripe price for pro:month');
  });
});
