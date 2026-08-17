import { X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Environment } from '@apple/app-store-server-library';
import { isAppleTransactionInScope, loadAppleIAPConfig } from '@/libs/payment/iap/apple/verifier';
import { APPLE_ROOT_CERTIFICATES } from '@/libs/payment/iap/apple/root-certificates';

const PRIVATE_KEY = [
  ['-----BEGIN', 'PRIVATE KEY-----'].join(' '),
  'fixture-material',
  ['-----END', 'PRIVATE KEY-----'].join(' '),
  '',
].join('\n');
const VALID_ENV = {
  APPLE_IAP_KEY_ID: 'key-id',
  APPLE_IAP_ISSUER_ID: 'issuer-id',
  APPLE_IAP_BUNDLE_ID: 'com.reglity.openread',
  APPLE_IAP_APPLE_ID: '1234567890',
  APPLE_IAP_PRIVATE_KEY_BASE64: Buffer.from(PRIVATE_KEY).toString('base64'),
  NODE_ENV: 'production',
};

describe('Apple root certificates', () => {
  it('pins the official Apple Root CA - G3 certificate', () => {
    const certificate = new X509Certificate(APPLE_ROOT_CERTIFICATES[0]!);
    expect(certificate.subject).toContain('CN=Apple Root CA - G3');
    expect(certificate.fingerprint256).toBe(
      '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79',
    );
  });
});

describe('loadAppleIAPConfig', () => {
  it('loads a complete canonical credential set', () => {
    expect(loadAppleIAPConfig(VALID_ENV)).toEqual({
      keyId: 'key-id',
      issuerId: 'issuer-id',
      bundleId: 'com.reglity.openread',
      appAppleId: 1234567890,
      privateKey: PRIVATE_KEY,
      environment: 'production',
    });
  });

  it.each([
    ['missing key ID', { ...VALID_ENV, APPLE_IAP_KEY_ID: '' }],
    ['missing production Apple app ID', { ...VALID_ENV, APPLE_IAP_APPLE_ID: '' }],
    ['invalid Apple app ID', { ...VALID_ENV, APPLE_IAP_APPLE_ID: 'not-numeric' }],
    ['malformed base64', { ...VALID_ENV, APPLE_IAP_PRIVATE_KEY_BASE64: 'not-base64' }],
    [
      'non-PEM material',
      {
        ...VALID_ENV,
        APPLE_IAP_PRIVATE_KEY_BASE64: Buffer.from('not a private key').toString('base64'),
      },
    ],
  ])('rejects %s without exposing credential material', (_name, environment) => {
    expect(() => loadAppleIAPConfig(environment)).toThrow(
      'Apple IAP credentials are not configured',
    );
  });

  it('uses the sandbox outside production', () => {
    expect(loadAppleIAPConfig({ ...VALID_ENV, NODE_ENV: 'test' }).environment).toBe('sandbox');
  });
});

describe('isAppleTransactionInScope', () => {
  const transaction = {
    bundleId: 'com.reglity.openread',
    environment: Environment.PRODUCTION,
    originalTransactionId: 'original-transaction-id',
  };

  it('accepts only the configured app, environment, and original transaction', () => {
    expect(
      isAppleTransactionInScope(
        transaction,
        'com.reglity.openread',
        Environment.PRODUCTION,
        'original-transaction-id',
      ),
    ).toBe(true);

    expect(
      isAppleTransactionInScope(
        transaction,
        'com.example.other',
        Environment.PRODUCTION,
        'original-transaction-id',
      ),
    ).toBe(false);
    expect(
      isAppleTransactionInScope(
        transaction,
        'com.reglity.openread',
        Environment.SANDBOX,
        'original-transaction-id',
      ),
    ).toBe(false);
    expect(
      isAppleTransactionInScope(
        transaction,
        'com.reglity.openread',
        Environment.PRODUCTION,
        'different-transaction-id',
      ),
    ).toBe(false);
  });
});
