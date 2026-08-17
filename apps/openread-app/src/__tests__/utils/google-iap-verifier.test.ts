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
  const publisher = {
    purchases: {
      subscriptions: {
        get: subscriptionsGet,
        acknowledge: vi.fn(),
        cancel: vi.fn(),
        refund: vi.fn(),
        defer: vi.fn(),
      },
      products: {
        get: productsGet,
        acknowledge: vi.fn(),
      },
    },
  } as unknown as androidpublisher_v3.Androidpublisher;
  return { publisher, subscriptionsGet, productsGet };
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
});
