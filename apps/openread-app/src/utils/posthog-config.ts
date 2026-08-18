type PostHogEnv = {
  NEXT_PUBLIC_POSTHOG_KEY?: string;
  NEXT_PUBLIC_POSTHOG_HOST?: string;
};

export type PostHogConfig = {
  key: string;
  host: string;
};

export function getPostHogConfig(env?: PostHogEnv): PostHogConfig | null {
  const key = (env ? env.NEXT_PUBLIC_POSTHOG_KEY : process.env.NEXT_PUBLIC_POSTHOG_KEY)?.trim();
  const host = (env ? env.NEXT_PUBLIC_POSTHOG_HOST : process.env.NEXT_PUBLIC_POSTHOG_HOST)
    ?.trim()
    .replace(/\/+$/, '');

  if (!key || !host) return null;

  return { key, host };
}
