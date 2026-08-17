import { describe, expect, it } from 'vitest';
import { GOOGLE_PLAY_PACKAGE_NAME, loadGoogleIAPConfig } from '@/libs/payment/iap/google/verifier';

const PRIVATE_KEY = [
  ['-----BEGIN', 'PRIVATE KEY-----'].join(' '),
  'fixture-material',
  ['-----END', 'PRIVATE KEY-----'].join(' '),
  '',
].join('\n');

const SERVICE_ACCOUNT = {
  type: 'service_account',
  project_id: 'fixture-project',
  private_key_id: 'fixture-key-id',
  private_key: PRIVATE_KEY,
  client_email: 'iap-verifier@fixture-project.iam.gserviceaccount.com',
  token_uri: 'https://oauth2.googleapis.com/token',
};
const ENCODED_SERVICE_ACCOUNT = Buffer.from(JSON.stringify(SERVICE_ACCOUNT)).toString('base64');

describe('loadGoogleIAPConfig', () => {
  it('loads canonical service-account JSON without exposing its material', () => {
    expect(
      loadGoogleIAPConfig({
        GOOGLE_IAP_SERVICE_ACCOUNT_JSON_BASE64: ENCODED_SERVICE_ACCOUNT,
        NODE_ENV: 'production',
      }),
    ).toEqual({
      credentials: SERVICE_ACCOUNT,
      packageName: GOOGLE_PLAY_PACKAGE_NAME,
      acceptTestPurchases: false,
    });
  });

  it.each([
    ['missing material', undefined],
    ['malformed base64', 'not-base64'],
    ['malformed JSON', Buffer.from('not-json').toString('base64')],
    [
      'wrong account type',
      Buffer.from(JSON.stringify({ ...SERVICE_ACCOUNT, type: 'authorized_user' })).toString(
        'base64',
      ),
    ],
    [
      'wrong token endpoint',
      Buffer.from(
        JSON.stringify({ ...SERVICE_ACCOUNT, token_uri: 'https://example.com/token' }),
      ).toString('base64'),
    ],
  ])('rejects %s with a generic error', (_name, material) => {
    expect(() => loadGoogleIAPConfig({ GOOGLE_IAP_SERVICE_ACCOUNT_JSON_BASE64: material })).toThrow(
      'Google Play credentials are not configured',
    );
  });

  it('allows test purchases only outside production', () => {
    expect(
      loadGoogleIAPConfig({
        GOOGLE_IAP_SERVICE_ACCOUNT_JSON_BASE64: ENCODED_SERVICE_ACCOUNT,
        NODE_ENV: 'test',
      }).acceptTestPurchases,
    ).toBe(true);
  });
});
