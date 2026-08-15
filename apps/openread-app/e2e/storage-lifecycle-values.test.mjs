import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseVisibleStorageSnapshot,
  redactLifecycleNetworkValue,
  redactLifecycleResponseBody,
} from './storage-lifecycle-values.mjs';

describe('storage lifecycle visible value parser', () => {
  it('parses the exact values rendered by the Cloud Storage card', () => {
    assert.deepEqual(parseVisibleStorageSnapshot('0 B of 1 GB used', '0%'), {
      usageText: '0 B of 1 GB used',
      percentageText: '0%',
      usedText: '0 B',
      totalText: '1 GB',
      usedBytes: 0,
      totalBytes: 1024 ** 3,
      percentage: 0,
    });

    assert.deepEqual(parseVisibleStorageSnapshot('185 KB of 1 GB used', '0%'), {
      usageText: '185 KB of 1 GB used',
      percentageText: '0%',
      usedText: '185 KB',
      totalText: '1 GB',
      usedBytes: 185 * 1024,
      totalBytes: 1024 ** 3,
      percentage: 0,
    });
  });

  it('rejects unavailable, malformed, and impossible displays', () => {
    assert.throws(
      () => parseVisibleStorageSnapshot('Storage usage is unavailable', '0%'),
      /Unrecognized visible storage usage/,
    );
    assert.throws(() => parseVisibleStorageSnapshot('2 GB of 1 GB used', '100%'), /usage exceeds/);
    assert.throws(
      () => parseVisibleStorageSnapshot('0 B of 0 GB used', '0%'),
      /quota must be positive/,
    );
  });
});

describe('storage lifecycle network evidence redaction', () => {
  it('retains response shape while redacting credential-bearing fields and headers', () => {
    assert.deepEqual(
      redactLifecycleNetworkValue({
        status: 200,
        uploadUrl: 'https://signed.example/upload?X-Amz-Signature=secret',
        nested: { access_token: 'token-value', fileId: 'file-1' },
        headers: { 'content-type': 'application/json', 'set-cookie': 'session=secret' },
      }),
      {
        status: 200,
        uploadUrl: '[REDACTED]',
        nested: { access_token: '[REDACTED]', fileId: 'file-1' },
        headers: { 'content-type': 'application/json', 'set-cookie': '[REDACTED]' },
      },
    );
  });

  it('redacts signed query values and bearer credentials in non-JSON bodies', () => {
    const redacted = redactLifecycleResponseBody(
      'upload=https://signed.example/file?X-Amz-Signature=secret&token=abc Bearer header.payload.sig',
    );
    assert.equal(redacted.includes('secret'), false);
    assert.equal(redacted.includes('token=abc'), false);
    assert.equal(redacted.includes('header.payload.sig'), false);
    assert.match(redacted, /X-Amz-Signature=\[REDACTED\]/);
    assert.match(redacted, /token=\[REDACTED\]/);
    assert.match(redacted, /Bearer \[REDACTED\]/);
  });
});
