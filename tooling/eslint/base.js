/**
 * Base ESLint configuration shared across all packages.
 *
 * ESLint 9 flat config format.
 *
 * @type {import('eslint').Linter.FlatConfig}
 */
const baseConfig = {
  name: '@openread/eslint-config/base',
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};

export default baseConfig;
