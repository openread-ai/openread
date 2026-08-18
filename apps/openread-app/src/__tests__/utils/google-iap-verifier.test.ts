import { describe, expect, it, vi } from 'vitest';
import { androidpublisher_v3 } from 'googleapis';
import {
  GOOGLE_PLAY_PACKAGE_NAME,
  GoogleIAPConfig,
  GoogleIAPVerifier,
  VerifyPurchaseParams,
} from '@/libs/payment/iap/google/verifier';
import { IAPError } from '@/libs/payment/iap/types';

const CONFIG: GoogleIAPConfig = {
  credentials: {
    client_email: 'iap-verifier@fixture-project.iam.gserviceaccount.com',
    private_key: 'fixture-material',
  },
  packageName: GOOGLE_PLAY_PACKAGE_NAME,
  acceptTestPurchases: false,
};

const PARAMS: VerifyPurchaseParams = {
  orderId: 'order-id',
  purchaseToken: 'purchase-token',
  productId: 'com.reglity.openread.reader.monthly',
  packageName: GOOGLE_PLAY_PACKAGE_NAME,
};

const createPublisher = () => {
  const subscriptionsGet = vi.fn();
  const productsGet = vi.fn();
  // v2 succeeds with no overriding lifecycle state by default so the v1
  // mapping is exercised; individual tests override for grace/hold/pause and
  // the fail-closed path.
  const subscriptionsV2Get = vi.fn().mockResolvedValue({ data: {} });
  const publisher = {
    purchases: {
      subscriptions: {
        get: subscriptionsGet,
        acknowledge: vi.fn(),
        cancel: vi.fn(),
        refund: vi.fn(),
        defer: vi.fn(),
      },
      subscriptionsv2: {
        get: subscriptionsV2Get,
      },
      products: {
        get: productsGet,
        acknowledge: vi.fn(),
      },
    },
  } as unknown as androidpublisher_v3.Androidpublisher;
  return { publisher, subscriptionsGet, productsGet, subscriptionsV2Get };
};

describe('GoogleIAPVerifier', () => {
  it('rejects package and product IDs outside the OpenRead contract before Google calls', async () => {
    const { publisher, subscriptionsGet, productsGet } = createPublisher();
    const verifier = new GoogleIAPVerifier(CONFIG, publisher);

    await expect(
      verifier.verifyPurchase({ ...PARAMS, packageName: 'com.example.other' }),
    ).resolves.toEqual({
      success: false,
      error: IAPError.TRANSACTION_CANNOT_BE_VERIFIED,
    });
    await expect(
      verifier.verifyPurchase({ ...PARAMS, productId: 'com.example.unknown' }),
    ).resolves.toEqual({
      success: false,
      error: IAPError.TRANSACTION_CANNOT_BE_VERIFIED,
    });
    expect(subscriptionsGet).not.toHaveBeenCalled();
    expect(productsGet).not.toHaveBeenCalled();
  });

  it('returns a generic failure when Google verification fails', async () => {
    const { publisher, subscriptionsGet, productsGet } = createPublisher();
    subscriptionsGet.mockRejectedValue(new Error('upstream detail'));
    productsGet.mockRejectedValue(new Error('credential detail'));

    await expect(new GoogleIAPVerifier(CONFIG, publisher).verifyPurchase(PARAMS)).resolves.toEqual({
      success: false,
      error: IAPError.TRANSACTION_CANNOT_BE_VERIFIED,
    });
  });

  it('rejects Google test purchases in production', async () => {
    const { publisher, subscriptionsGet, productsGet } = createPublisher();
    subscriptionsGet.mockResolvedValue({
      data: {
        purchaseType: 0,
        paymentState: 1,
        expiryTimeMillis: String(Date.now() + 60_000),
      },
    });
    productsGet.mockRejectedValue(new Error('not a product'));

    await expect(new GoogleIAPVerifier(CONFIG, publisher).verifyPurchase(PARAMS)).resolves.toEqual({
      success: false,
      error: IAPError.TRANSACTION_CANNOT_BE_VERIFIED,
    });
  });

  it('accepts an active production subscription within scope', async () => {
    const { publisher, subscriptionsGet } = createPublisher();
    subscriptionsGet.mockResolvedValue({
      data: {
        orderId: PARAMS.orderId,
        purchaseType: 1,
        paymentState: 1,
        startTimeMillis: String(Date.now() - 60_000),
        expiryTimeMillis: String(Date.now() + 60_000),
      },
    });

    const result = await new GoogleIAPVerifier(CONFIG, publisher).verifyPurchase(PARAMS);

    expect(result.success).toBe(true);
    expect(result.status).toBe('active');
    expect(result.purchaseType).toBe('subscription');
  });

  it('classifies an unexpired free trial as trialing, not expired (#570)', async () => {
    const { publisher, subscriptionsGet } = createPublisher();
    subscriptionsGet.mockResolvedValue({
      data: {
        orderId: PARAMS.orderId,
        purchaseType: 1,
        paymentState: 2,
        startTimeMillis: String(Date.now() - 60_000),
        expiryTimeMillis: String(Date.now() + 60_000),
      },
    });

    const result = await new GoogleIAPVerifier(CONFIG, publisher).verifyPurchase(PARAMS);

    expect(result.success).toBe(true);
    expect(result.status).toBe('trialing');
    expect(result.purchaseType).toBe('subscription');
  });

  it('classifies an elapsed free trial as expired', async () => {
    const { publisher, subscriptionsGet } = createPublisher();
    subscriptionsGet.mockResolvedValue({
      data: {
        orderId: PARAMS.orderId,
        purchaseType: 1,
        paymentState: 2,
        startTimeMillis: String(Date.now() - 120_000),
        expiryTimeMillis: String(Date.now() - 60_000),
      },
    });

    const result = await new GoogleIAPVerifier(CONFIG, publisher).verifyPurchase(PARAMS);

    expect(result.success).toBe(true);
    expect(result.status).toBe('expired');
  });

  // #570 regression starting from the provider response: subscriptionsv2 is the
  // authoritative grace-period signal; the emitted status must stay
  // deletion-discoverable once stored verbatim.
  it('classifies a subscriptionsv2 grace period as in_grace_period', async () => {
    const { publisher, subscriptionsGet, subscriptionsV2Get } = createPublisher();
    subscriptionsGet.mockResolvedValue({
      data: {
        orderId: PARAMS.orderId,
        purchaseType: 1,
        paymentState: undefined,
        startTimeMillis: String(Date.now() - 120_000),
        expiryTimeMillis: String(Date.now() - 60_000),
      },
    });
    subscriptionsV2Get.mockResolvedValue({
      data: { subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' },
    });

    const result = await new GoogleIAPVerifier(CONFIG, publisher).verifyPurchase(PARAMS);

    expect(result.success).toBe(true);
    expect(result.status).toBe('in_grace_period');
  });

  it('keeps a deferred plan change entitled while unexpired (#570 decision)', async () => {
    const { publisher, subscriptionsGet } = createPublisher();
    subscriptionsGet.mockResolvedValue({
      data: {
        orderId: PARAMS.orderId,
        purchaseType: 1,
        paymentState: 3,
        startTimeMillis: String(Date.now() - 60_000),
        expiryTimeMillis: String(Date.now() + 60_000),
      },
    });

    const result = await new GoogleIAPVerifier(CONFIG, publisher).verifyPurchase(PARAMS);

    expect(result.success).toBe(true);
    expect(result.status).toBe('active');
  });

  it.each([
    ['SUBSCRIPTION_STATE_ON_HOLD', 'on_hold'],
    ['SUBSCRIPTION_STATE_PAUSED', 'paused'],
  ])('classifies %s as the future-billing status %s (#570)', async (state, expected) => {
    const { publisher, subscriptionsGet, subscriptionsV2Get } = createPublisher();
    subscriptionsGet.mockResolvedValue({
      data: {
        orderId: PARAMS.orderId,
        purchaseType: 1,
        startTimeMillis: String(Date.now() - 120_000),
        expiryTimeMillis: String(Date.now() - 60_000),
      },
    });
    subscriptionsV2Get.mockResolvedValue({ data: { subscriptionState: state } });

    const result = await new GoogleIAPVerifier(CONFIG, publisher).verifyPurchase(PARAMS);

    expect(result.success).toBe(true);
    expect(result.status).toBe(expected);
  });

  it('fails closed when the authoritative subscriptionsv2 read is unavailable (#570)', async () => {
    const { publisher, subscriptionsGet, subscriptionsV2Get } = createPublisher();
    subscriptionsGet.mockResolvedValue({
      data: {
        orderId: PARAMS.orderId,
        purchaseType: 1,
        paymentState: 1,
        startTimeMillis: String(Date.now() - 60_000),
        expiryTimeMillis: String(Date.now() + 60_000),
      },
    });
    subscriptionsV2Get.mockRejectedValue(new Error('v2 unavailable'));

    await expect(new GoogleIAPVerifier(CONFIG, publisher).verifyPurchase(PARAMS)).resolves.toEqual({
      success: false,
      error: IAPError.TRANSACTION_CANNOT_BE_VERIFIED,
    });
  });
});
