/**
 * ESLint rules to enforce license boundaries in the reader app.
 *
 * The reader (AGPL) cannot import proprietary packages.
 * Only MIT-licensed packages (@openread/sdk, @openread/types) are allowed.
 *
 * This prevents AGPL "viral" licensing from contaminating proprietary code.
 *
 * ESLint 9 flat config format.
 *
 * @type {import('eslint').Linter.FlatConfig}
 */
const readerRestrictionsConfig = {
  name: '@openread/eslint-config/reader-restrictions',
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@openread/core', '@openread/core/*'],
            message:
              'Reader (AGPL) cannot import proprietary @openread/core. Use @openread/sdk instead for platform communication.',
          },
          {
            group: ['@openread/db', '@openread/db/*'],
            message:
              'Reader (AGPL) cannot import proprietary @openread/db. Database access should go through @openread/sdk.',
          },
          {
            group: ['@openread/mcp', '@openread/mcp/*'],
            message:
              'Reader (AGPL) cannot import proprietary @openread/mcp. MCP functionality is server-side only.',
          },
          {
            group: ['@openread/ingestion', '@openread/ingestion/*'],
            message:
              'Reader (AGPL) cannot import proprietary @openread/ingestion. Use @openread/sdk for upload functionality.',
          },
        ],
      },
    ],
  },
};

export default readerRestrictionsConfig;
