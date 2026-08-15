import { describe, expect, it } from 'vitest';
import { redactUrlFragment } from '@/utils/redact-url-fragment';

const SYNTHETIC_CALLBACK =
  'openread://auth-callback#access_token=synthetic.access.token&refresh_token=synthetic.refresh.token&type=magiclink';
const SYNTHETIC_OUTBOUND =
  'https://auth.example.test/authorize?client_id=synthetic-client&redirect_uri=openread://auth-callback&state=synthetic-state&code_challenge=synthetic-challenge';

describe('redactUrlFragment', () => {
  it('redacts a fragment-bearing OAuth callback URL and keeps origin and path', () => {
    expect(redactUrlFragment(SYNTHETIC_CALLBACK)).toBe('openread://auth-callback#<redacted>');
    expect(redactUrlFragment(SYNTHETIC_CALLBACK)).not.toContain('synthetic.access.token');
    expect(redactUrlFragment(SYNTHETIC_CALLBACK)).not.toContain('synthetic.refresh.token');
  });

  it('leaves a fragment-free URL unchanged', () => {
    expect(redactUrlFragment(SYNTHETIC_OUTBOUND)).toBe(SYNTHETIC_OUTBOUND);
    expect(redactUrlFragment('openread://auth-callback')).toBe('openread://auth-callback');
  });
});
