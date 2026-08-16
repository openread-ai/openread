import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSubscriptionRetrieve = vi.fn();
const mockInvoiceRetrieve = vi.fn();
const mockInvoicePaymentsList = vi.fn();
const mockPaymentIntentRetrieve = vi.fn();
const mockPaymentInsert = vi.fn().mockResolvedValue({ data: null, error: null });
const mockPaymentUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ data: null, error: null }),
});

const mockStripeClient = {
  subscriptions: { retrieve: mockSubscriptionRetrieve },
  invoices: { retrieve: mockInvoiceRetrieve },
  invoicePayments: { list: mockInvoicePaymentsList },
  paymentIntents: { retrieve: mockPaymentIntentRetrieve },
  checkout: { sessions: { retrieve: vi.fn() } },
};

const MockStripe = vi.fn(function MockStripeConstructor() {
  return mockStripeClient;
});
Object.assign(MockStripe, { createFetchHttpClient: vi.fn(() => ({})) });

vi.mock('stripe', () => ({
  default: MockStripe,
}));

const mockSupabaseFrom = vi.fn();
vi.mock('@/utils/supabase-admin.server', () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from: mockSupabaseFrom })),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('stripe server credential selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects the canonical test key for preview even when NODE_ENV is production', async () => {
    const { resolveStripeSecretKey } = await import('@/libs/payment/stripe/server');

    expect(
      resolveStripeSecretKey({
        VERCEL_ENV: 'preview',
        NODE_ENV: 'production',
        STRIPE_SECRET_KEY: 'sk_test_preview',
      }),
    ).toBe('sk_test_preview');
    expect(MockStripe).not.toHaveBeenCalled();
  });

  it('selects the canonical live key only for a production Vercel deployment', async () => {
    const { resolveStripeSecretKey } = await import('@/libs/payment/stripe/server');

    expect(
      resolveStripeSecretKey({
        VERCEL_ENV: 'production',
        NODE_ENV: 'development',
        STRIPE_SECRET_KEY: 'sk_live_production',
      }),
    ).toBe('sk_live_production');
    expect(MockStripe).not.toHaveBeenCalled();
  });

  it('selects the canonical test key for actual local development without VERCEL_ENV', async () => {
    const { resolveStripeSecretKey } = await import('@/libs/payment/stripe/server');

    expect(
      resolveStripeSecretKey({
        NODE_ENV: 'development',
        STRIPE_SECRET_KEY: 'sk_test_local',
      }),
    ).toBe('sk_test_local');
    expect(MockStripe).not.toHaveBeenCalled();
  });

  it('constructs local Stripe routes with the canonical test key', async () => {
    const previousVercelEnvironment = process.env['VERCEL_ENV'];

    delete process.env['VERCEL_ENV'];
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_local');

    try {
      const { createStripeClient } = await import('@/libs/payment/stripe/server');
      createStripeClient();

      expect(MockStripe).toHaveBeenCalledWith('sk_test_local', {
        httpClient: expect.anything(),
      });
    } finally {
      vi.unstubAllEnvs();
      if (previousVercelEnvironment === undefined) delete process.env['VERCEL_ENV'];
      else process.env['VERCEL_ENV'] = previousVercelEnvironment;
    }
  });

  it('throws when a production build has no deployment signal', async () => {
    const { resolveStripeSecretKey } = await import('@/libs/payment/stripe/server');

    expect(() =>
      resolveStripeSecretKey({
        NODE_ENV: 'production',
        STRIPE_SECRET_KEY: 'sk_test_preview',
      }),
    ).toThrow(/VERCEL_ENV/);
    expect(MockStripe).not.toHaveBeenCalled();
  });

  it('throws for a missing canonical key before constructing the Stripe client', async () => {
    const { createStripeClient } = await import('@/libs/payment/stripe/server');

    expect(() => createStripeClient({ VERCEL_ENV: 'preview' })).toThrow(/STRIPE_SECRET_KEY/);
    expect(MockStripe).not.toHaveBeenCalled();
  });

  it('rejects a live-mode key in preview before constructing Stripe', async () => {
    const { createStripeClient } = await import('@/libs/payment/stripe/server');

    expect(() =>
      createStripeClient({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: 'sk_live_production' }),
    ).toThrow(/test-mode key/);
    expect(MockStripe).not.toHaveBeenCalled();
  });

  it('rejects a test-mode key in production before constructing Stripe', async () => {
    const { createStripeClient } = await import('@/libs/payment/stripe/server');

    expect(() =>
      createStripeClient({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'sk_test_preview' }),
    ).toThrow(/live-mode key/);
    expect(MockStripe).not.toHaveBeenCalled();
  });
});

function tableMock(table: string) {
  if (table === 'subscriptions') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  }

  if (table === 'plans') {
    return {
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  }

  if (table === 'customers') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { user_id: 'user-1' }, error: null }),
        })),
      })),
    };
  }

  if (table === 'payments') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
      insert: mockPaymentInsert,
      update: mockPaymentUpdate,
    };
  }

  throw new Error(`Unexpected table ${table}`);
}

describe('stripe server billing persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['VERCEL_ENV'] = 'development';
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_local';
    mockSupabaseFrom.mockImplementation(tableMock);
  });

  it('upserts the canonical plans row when a subscription is created', async () => {
    mockSubscriptionRetrieve.mockResolvedValue({
      status: 'active',
      items: {
        data: [
          {
            current_period_start: 1_781_381_253,
            current_period_end: 1_784_059_653,
            price: {
              id: 'price_reader_monthly',
              product: { metadata: { plan: 'reader' } },
            },
          },
        ],
      },
    });

    const { createOrUpdateSubscription } = await import('@/libs/payment/stripe/server');
    await createOrUpdateSubscription('user-1', 'cus_1', 'sub_1');

    const plansClient = mockSupabaseFrom.mock.results
      .map((result) => result.value)
      .find((client) => client.upsert);

    expect(mockSupabaseFrom).toHaveBeenCalledWith('plans');
    expect(plansClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-1',
        plan: 'reader',
        status: 'active',
        updated_at: expect.any(String),
      }),
      { onConflict: 'id', ignoreDuplicates: false },
    );
  });

  it('records paid subscription invoice payments from an enabled invoice event', async () => {
    mockInvoicePaymentsList.mockResolvedValue({
      data: [
        {
          id: 'inpay_1',
          status: 'paid',
          amount_paid: 999,
          currency: 'usd',
          invoice: 'in_1',
          payment: { type: 'payment_intent', payment_intent: 'pi_1' },
        },
      ],
    });
    mockInvoiceRetrieve.mockResolvedValue({
      customer: 'cus_1',
      parent: { subscription_details: { subscription: 'sub_1' } },
      lines: {
        data: [
          {
            pricing: {
              price_details: { product: 'prod_reader' },
            },
          },
        ],
      },
    });
    mockPaymentIntentRetrieve.mockResolvedValue({
      id: 'pi_1',
      amount: 999,
      amount_received: 999,
      currency: 'usd',
      status: 'succeeded',
      customer: 'cus_1',
      payment_method: 'pm_1',
    });

    const { recordStripeInvoicePaymentFromInvoice } = await import('@/libs/payment/stripe/server');
    await recordStripeInvoicePaymentFromInvoice({ id: 'in_1' } as never);

    expect(mockInvoicePaymentsList).toHaveBeenCalledWith({
      invoice: 'in_1',
      status: 'paid',
      limit: 1,
    });
    expect(mockSupabaseFrom).toHaveBeenCalledWith('payments');
    expect(mockPaymentInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        provider: 'stripe',
        stripe_customer_id: 'cus_1',
        stripe_payment_intent_id: 'pi_1',
        amount: 999,
        currency: 'usd',
        status: 'succeeded',
        product_id: 'prod_reader',
        metadata: expect.objectContaining({
          stripe_invoice_id: 'in_1',
          stripe_invoice_payment_id: 'inpay_1',
          stripe_subscription_id: 'sub_1',
        }),
      }),
    );
  });

  it('records paid subscription invoice payments by payment intent', async () => {
    mockInvoiceRetrieve.mockResolvedValue({
      customer: 'cus_1',
      parent: { subscription_details: { subscription: 'sub_1' } },
      lines: {
        data: [
          {
            pricing: {
              price_details: { product: 'prod_reader' },
            },
          },
        ],
      },
    });
    mockPaymentIntentRetrieve.mockResolvedValue({
      id: 'pi_1',
      amount: 999,
      amount_received: 999,
      currency: 'usd',
      status: 'succeeded',
      customer: 'cus_1',
      payment_method: 'pm_1',
    });

    const { recordStripeInvoicePayment } = await import('@/libs/payment/stripe/server');
    await recordStripeInvoicePayment({
      id: 'inpay_1',
      status: 'paid',
      amount_paid: 999,
      currency: 'usd',
      invoice: 'in_1',
      payment: { type: 'payment_intent', payment_intent: 'pi_1' },
    } as never);

    expect(mockSupabaseFrom).toHaveBeenCalledWith('payments');
    expect(mockPaymentInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        provider: 'stripe',
        stripe_customer_id: 'cus_1',
        stripe_payment_intent_id: 'pi_1',
        amount: 999,
        currency: 'usd',
        status: 'succeeded',
        product_id: 'prod_reader',
        metadata: expect.objectContaining({
          stripe_invoice_id: 'in_1',
          stripe_invoice_payment_id: 'inpay_1',
          stripe_subscription_id: 'sub_1',
        }),
      }),
    );
  });
});
