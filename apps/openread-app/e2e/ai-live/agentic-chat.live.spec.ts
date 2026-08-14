import { test, expect } from '../fixtures/auth';
import {
  askLiveReaderQuestion,
  attachLiveEvalResult,
  configuredTextEvalBook,
  expectNotFullPromptTier,
  expectUsefulLiveAnswer,
  importCatalogSearchResultAndOpenReader,
  liveAiDiagnostic,
  navigateToEvalBookReader,
} from './helpers';

/**
 * Live production-style agentic chat evals.
 *
 * These tests intentionally do not mock model responses. They drive the Reader
 * UI, call the real /api/ai/agentic-chat route, wait for streamed output, and
 * assert provider/planner headers plus user-visible answer health.
 *
 * Run manually/release-gated with:
 *   LIVE_AI_EVALS=1 AI_EVAL_BASE_URL=https://app.openread.ai pnpm --filter @openread/openread-app test:e2e:ai-live
 */

test.skip(process.env.LIVE_AI_EVALS !== '1', 'Set LIVE_AI_EVALS=1 to run live AI evals.');

test.describe.serial('live AI agentic Reader chat evals', () => {
  test('current-page question streams a grounded answer without full-book prompt tier', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await navigateToEvalBookReader(page, configuredTextEvalBook());

    const result = await askLiveReaderQuestion(
      page,
      'current-page-reader-context',
      'Based only on the current place in the book, what is the immediate point being made? Reply in two concise sentences.',
    );

    await attachLiveEvalResult(testInfo, result);
    expectUsefulLiveAnswer(result);
    expectNotFullPromptTier(result);
  });

  test('broad book question streams through incremental context instead of full prompt tier', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await navigateToEvalBookReader(page, configuredTextEvalBook());

    const result = await askLiveReaderQuestion(
      page,
      'broad-book-incremental-context',
      'Across the whole book, what are three recurring ideas? Keep the answer concise and mention that you are using the available book context.',
    );

    await attachLiveEvalResult(testInfo, result);
    expectUsefulLiveAnswer(result);
    expectNotFullPromptTier(result);
  });

  test('catalog-imported public-domain book can chat through canonical catalog reference', async ({
    authenticatedPage: page,
  }, testInfo) => {
    const query = process.env.AI_EVAL_CATALOG_QUERY ?? 'Pride and Prejudice';
    const { title, importedBookHash } = await importCatalogSearchResultAndOpenReader(page, query);

    const result = await askLiveReaderQuestion(
      page,
      'catalog-import-reader-context',
      `What is "${title}" about? Reply in two concise sentences using the opened book context.`,
    );

    await attachLiveEvalResult(testInfo, result);
    expectUsefulLiveAnswer(result);

    const requestBookHash = result.requestBody?.bookHash;
    expect(String(requestBookHash), liveAiDiagnostic(result)).toMatch(/^catalog:[0-9a-f-]{36}$/i);
    if (importedBookHash) expect(String(requestBookHash)).toBe(importedBookHash);
  });
});
