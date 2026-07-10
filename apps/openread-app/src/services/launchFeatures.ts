/**
 * Launch holdbacks for features intentionally excluded from the first production launch.
 *
 * Keep the underlying implementation in place so the features can be re-enabled later without
 * reintroducing broad platform code. User-facing launch surfaces and API entry points should
 * check these constants before exposing TTS, translation, or KOReader sync behavior.
 */
export const LAUNCH_TTS_ENABLED = false;
export const LAUNCH_TRANSLATION_ENABLED = false;
export const LAUNCH_KOREADER_SYNC_ENABLED = false;
export const LAUNCH_MCP_ENABLED = process.env['NEXT_PUBLIC_OPENREAD_MCP_ENABLED'] === '1';
export const LAUNCH_BYOK_ENABLED = process.env['OPENREAD_ENABLE_BYOK_IN_TESTS'] === '1';

export const LAUNCH_DISABLED_FEATURE_MESSAGE = 'This feature is not available for launch.';
export const LAUNCH_MCP_DISABLED_MESSAGE = 'MCP is not available for this release.';
export const LAUNCH_BYOK_DISABLED_MESSAGE = 'BYOK is not available for this release.';
