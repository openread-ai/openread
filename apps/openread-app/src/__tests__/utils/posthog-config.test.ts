import { describe, expect, it } from 'vitest';

import { getPostHogConfig } from '@/utils/posthog-config';

describe('PostHog config', () => {
  it('uses the canonical public project token and host', () => {
    expect(
      getPostHogConfig({
        NEXT_PUBLIC_POSTHOG_KEY: ' phc_project_token ',
        NEXT_PUBLIC_POSTHOG_HOST: ' https://us.i.posthog.com/ ',
      }),
    ).toEqual({
      key: 'phc_project_token',
      host: 'https://us.i.posthog.com',
    });
  });

  it('stays disabled unless the complete pair is configured', () => {
    expect(getPostHogConfig({})).toBeNull();
    expect(getPostHogConfig({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_project_token' })).toBeNull();
    expect(getPostHogConfig({ NEXT_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com' })).toBeNull();
  });
});
