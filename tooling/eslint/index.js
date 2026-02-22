/**
 * @openread/eslint-config
 *
 * Shareable ESLint configurations for OpenRead monorepo.
 * ESLint 9 flat config format.
 *
 * Usage in eslint.config.mjs:
 *
 *   import baseConfig from '@openread/eslint-config';
 *   import readerRestrictions from '@openread/eslint-config/reader';
 *
 *   export default [
 *     baseConfig,
 *     readerRestrictions,  // For reader app only - enforces license boundaries
 *     // ... other configs
 *   ];
 *
 * Available exports:
 *   - '@openread/eslint-config'        - Base config with standard rules
 *   - '@openread/eslint-config/base'   - Same as above (explicit)
 *   - '@openread/eslint-config/reader' - Reader license boundary restrictions
 */
export { default } from './base.js';
export { default as base } from './base.js';
export { default as readerRestrictions } from './reader-restrictions.js';
