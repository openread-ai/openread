const APP_RELEASE_PREFIX = 'openread-web';
const DEFAULT_SENTRY_ENVIRONMENT = 'development';
const NON_PRODUCTION_VERCEL_ENVIRONMENTS = new Set(['preview', 'development']);
export const DEFAULT_SENTRY_PLATFORM = 'web';

function getDeploymentEnvironmentSignal() {
  return {
    VERCEL_ENV: process.env['VERCEL_ENV'],
    NODE_ENV: process.env['NODE_ENV'],
  };
}

/**
 * Resolve the credential and deployment-control environment.
 *
 * Production is defined only by Vercel's deployment signal. NODE_ENV cannot
 * distinguish preview from production because both use NODE_ENV=production;
 * it identifies non-production only for an actual local development server.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {'production' | 'non-production'}
 */
export function resolveDeploymentEnvironment(env = getDeploymentEnvironmentSignal()) {
  const vercelEnvironment = env['VERCEL_ENV'];
  if (vercelEnvironment !== undefined) {
    if (vercelEnvironment === 'production') return 'production';
    if (NON_PRODUCTION_VERCEL_ENVIRONMENTS.has(vercelEnvironment)) return 'non-production';

    throw new Error(
      `Unsupported VERCEL_ENV "${vercelEnvironment}". Expected production, preview, or development.`,
    );
  }

  if (env['NODE_ENV'] === 'development') return 'non-production';

  throw new Error(
    'VERCEL_ENV is required unless NODE_ENV identifies an actual local development server.',
  );
}

/**
 * Resolve the Sentry label from the canonical deployment environment.
 *
 * The public value is the build-time label injected for browser runtimes. It
 * remains a telemetry label, not a credential-selection signal.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function resolveSentryEnvironment(env = process.env) {
  if (env['VERCEL_ENV'] !== undefined) {
    return resolveDeploymentEnvironment(env) === 'production' ? 'production' : env['VERCEL_ENV'];
  }

  return (
    env['NEXT_PUBLIC_SENTRY_ENVIRONMENT'] || env['SENTRY_ENVIRONMENT'] || DEFAULT_SENTRY_ENVIRONMENT
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
