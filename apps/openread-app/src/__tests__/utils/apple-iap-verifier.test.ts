import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  Status,
  Type,
} from '@apple/app-store-server-library';
import { AppleIAPVerifier } from '@/libs/payment/iap/apple/verifier';
import { IAPError } from '@/libs/payment/iap/types';
import { ACTIVE_IAP_STATUSES, REVOCABLE_IAP_STATUSES } from '@/libs/payment/subscription-statuses';

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

  // #570 regression starting from the provider response: a subscription the App
  // Store reports as BILLING_GRACE_PERIOD must be classified as in_grace_period
  // so the stored row remains discoverable by account deletion.
  it('classifies an App Store billing grace period as in_grace_period', async () => {
    vi.spyOn(AppStoreServerAPIClient.prototype, 'getTransactionInfo').mockResolvedValue({
      signedTransactionInfo: 'signed-transaction',
    });
    vi.spyOn(SignedDataVerifier.prototype, 'verifyAndDecodeTransaction').mockResolvedValue({
      ...TRANSACTION,
      expiresDate: Date.now() - 60_000,
    });
    vi.spyOn(AppStoreServerAPIClient.prototype, 'getAllSubscriptionStatuses').mockResolvedValue({
      bundleId: CONFIG.bundleId,
      environment: Environment.SANDBOX,
      data: [
        {
          lastTransactions: [
            {
              originalTransactionId: TRANSACTION.originalTransactionId,
              status: Status.BILLING_GRACE_PERIOD,
              signedTransactionInfo: 'signed-last-transaction',
            },
          ],
        },
      ],
    } as never);

    const result = await new AppleIAPVerifier(CONFIG).verifyTransaction(
      TRANSACTION.originalTransactionId,
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('in_grace_period');
    // The emitted status is entitlement-bearing, so once stored verbatim it is
    // matched by account deletion's revocation discovery.
    expect(ACTIVE_IAP_STATUSES).toContain(result.status);
  });

  // #570: billing retry has no entitlement, but Apple keeps attempting
  // collection, so the stored row must stay revocable at account deletion.
  it('classifies an App Store billing retry as billing_retry', async () => {
    vi.spyOn(AppStoreServerAPIClient.prototype, 'getTransactionInfo').mockResolvedValue({
      signedTransactionInfo: 'signed-transaction',
    });
    vi.spyOn(SignedDataVerifier.prototype, 'verifyAndDecodeTransaction').mockResolvedValue({
      ...TRANSACTION,
      expiresDate: Date.now() - 60_000,
    });
    vi.spyOn(AppStoreServerAPIClient.prototype, 'getAllSubscriptionStatuses').mockResolvedValue({
      bundleId: CONFIG.bundleId,
      environment: Environment.SANDBOX,
      data: [
        {
          lastTransactions: [
            {
              originalTransactionId: TRANSACTION.originalTransactionId,
              status: Status.BILLING_RETRY,
              signedTransactionInfo: 'signed-last-transaction',
            },
          ],
        },
      ],
    } as never);

    const result = await new AppleIAPVerifier(CONFIG).verifyTransaction(
      TRANSACTION.originalTransactionId,
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('billing_retry');
    expect(REVOCABLE_IAP_STATUSES).toContain(result.status);
    expect(ACTIVE_IAP_STATUSES).not.toContain(result.status);
  });
});
