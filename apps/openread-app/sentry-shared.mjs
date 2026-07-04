const APP_RELEASE_PREFIX = 'openread-web';
const DEFAULT_SENTRY_ENVIRONMENT = 'development';
export const DEFAULT_SENTRY_PLATFORM = 'web';

/**
 * Resolve the Sentry environment from the deployment provider contract.
 *
 * Vercel preview builds run with NODE_ENV=production, so provider-specific
 * VERCEL_ENV must be considered before the generic Node environment fallback.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function resolveSentryEnvironment(env = process.env) {
  return (
    env['NEXT_PUBLIC_SENTRY_ENVIRONMENT'] ||
    env['SENTRY_ENVIRONMENT'] ||
    env['VERCEL_ENV'] ||
    env['NODE_ENV'] ||
    DEFAULT_SENTRY_ENVIRONMENT
  );
}

/**
 * Resolve the release shared by runtime events and source-map uploads.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function resolveSentryRelease(env = process.env) {
  return (
    env['NEXT_PUBLIC_SENTRY_RELEASE'] ||
    env['SENTRY_RELEASE'] ||
    (env['VERCEL_GIT_COMMIT_SHA'] ? `${APP_RELEASE_PREFIX}@${env['VERCEL_GIT_COMMIT_SHA']}` : '') ||
    (env['npm_package_version'] ? `${APP_RELEASE_PREFIX}@${env['npm_package_version']}` : '') ||
    `${APP_RELEASE_PREFIX}@development`
  );
}
