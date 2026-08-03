import { isFeatureLaunchEnabled, type FeatureLaunchOverrides } from '@openread/entitlements';

/**
 * App-boundary adapter for the canonical entitlement launch registry.
 *
 * The entitlements package stays environment-agnostic. This module translates
 * supported environment overrides into explicit arguments for registry decisions
 * and preserves the existing exported launch names for app consumers.
 */
export function resolveLaunchFeatureOverrides(
  env: Record<string, string | undefined>,
): FeatureLaunchOverrides {
  const byok = resolveBooleanOverride(env['OPENREAD_ENABLE_BYOK_IN_TESTS']);
  return byok === undefined ? {} : { byok };
}

const launchFeatureOverrides = resolveLaunchFeatureOverrides(process.env);

export function getLaunchFeatureOverrides(): FeatureLaunchOverrides {
  return launchFeatureOverrides;
}

export const LAUNCH_TTS_ENABLED = isFeatureLaunchEnabled('tts', launchFeatureOverrides);
export const LAUNCH_TRANSLATION_ENABLED = isFeatureLaunchEnabled(
  'translate',
  launchFeatureOverrides,
);
export const LAUNCH_BYOK_ENABLED = isFeatureLaunchEnabled('byok', launchFeatureOverrides);

// KOReader sync and MCP are not entitlement registry features. Their existing
// release guards remain unchanged by BILL-CANON P1.
export const LAUNCH_KOREADER_SYNC_ENABLED = false;
export const LAUNCH_MCP_ENABLED = process.env['NEXT_PUBLIC_OPENREAD_MCP_ENABLED'] === '1';

export const LAUNCH_DISABLED_FEATURE_MESSAGE = 'This feature is not available for launch.';
export const LAUNCH_MCP_DISABLED_MESSAGE = 'MCP is not available for this release.';
export const LAUNCH_BYOK_DISABLED_MESSAGE = 'BYOK is not available for this release.';

function resolveBooleanOverride(value: string | undefined): boolean | undefined {
  if (value === '1') return true;
  if (value === '0') return false;
  return undefined;
}
