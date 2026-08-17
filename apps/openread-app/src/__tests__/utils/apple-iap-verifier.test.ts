import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  Type,
} from '@apple/app-store-server-library';
import { AppleIAPVerifier } from '@/libs/payment/iap/apple/verifier';
import { IAPError } from '@/libs/payment/iap/types';

const CONFIG = {
  keyId: 'key-id',
  issuerId: 'issuer-id',
  bundleId: 'com.reglity.openread',
  privateKey: [
    ['-----BEGIN', 'PRIVATE KEY-----'].join(' '),
    'fixture-material',
    ['-----END', 'PRIVATE KEY-----'].join(' '),
    '',
  ].join('\n'),
  environment: 'sandbox' as const,
};

const TRANSACTION = {
  bundleId: CONFIG.bundleId,
  environment: Environment.SANDBOX,
  originalTransactionId: 'original-transaction-id',
  transactionId: 'transaction-id',
  productId: 'com.reglity.openread.reader.monthly',
  purchaseDate: Date.now(),
  quantity: 1,
  type: Type.AUTO_RENEWABLE_SUBSCRIPTION,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppleIAPVerifier', () => {
  it('fails closed when subscription status cannot be fetched', async () => {
    vi.spyOn(AppStoreServerAPIClient.prototype, 'getTransactionInfo').mockResolvedValue({
      signedTransactionInfo: 'signed-transaction',
    });
    vi.spyOn(SignedDataVerifier.prototype, 'verifyAndDecodeTransaction').mockResolvedValue(
      TRANSACTION,
    );
    vi.spyOn(AppStoreServerAPIClient.prototype, 'getAllSubscriptionStatuses').mockRejectedValue(
      new Error('upstream unavailable'),
    );

    const result = await new AppleIAPVerifier(CONFIG).verifyTransaction(
      TRANSACTION.originalTransactionId,
    );

    expect(result).toEqual({
      success: false,
      error: IAPError.TRANSACTION_CANNOT_BE_VERIFIED,
    });
  });

  it('rejects a signed transaction outside the configured scope', async () => {
    vi.spyOn(AppStoreServerAPIClient.prototype, 'getTransactionInfo').mockResolvedValue({
      signedTransactionInfo: 'signed-transaction',
    });
    vi.spyOn(SignedDataVerifier.prototype, 'verifyAndDecodeTransaction').mockResolvedValue({
      ...TRANSACTION,
      bundleId: 'com.example.other',
    });
    const statusSpy = vi.spyOn(AppStoreServerAPIClient.prototype, 'getAllSubscriptionStatuses');

    const result = await new AppleIAPVerifier(CONFIG).verifyTransaction(
      TRANSACTION.originalTransactionId,
    );

    expect(result).toEqual({
      success: false,
      error: IAPError.TRANSACTION_CANNOT_BE_VERIFIED,
    });
    expect(statusSpy).not.toHaveBeenCalled();
  });
});
