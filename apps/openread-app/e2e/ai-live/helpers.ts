import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { liveAiDiagnostic, type LiveAiChatResult } from './evidence';

export { liveAiDiagnostic, publishableLiveAiResult, type LiveAiChatResult } from './evidence';

export type EvalBookConfig = {
  hash: string;
  titlePattern: RegExp;
};

const DEFAULT_TEXT_BOOK_HASH = '65c789be32848655bc89109cb69cc712';
const DEFAULT_TEXT_BOOK_TITLE_PATTERN = '1-Page Marketing';

export function configuredTextEvalBook(): EvalBookConfig {
  return {
    hash: process.env.AI_EVAL_TEXT_BOOK_HASH ?? DEFAULT_TEXT_BOOK_HASH,
    titlePattern: new RegExp(
      process.env.AI_EVAL_TEXT_BOOK_TITLE_PATTERN ?? DEFAULT_TEXT_BOOK_TITLE_PATTERN,
      'i',
    ),
  };
}

export function liveEvalTimeoutMs(): number {
  return Number(process.env.AI_EVAL_RESPONSE_TIMEOUT_MS ?? 120_000);
}

export async function attachLiveEvalResult(
  testInfo: TestInfo,
  result: LiveAiChatResult,
): Promise<void> {
  testInfo.annotations.push(
    { type: `${result.scenario}-tier`, description: result.tier },
    { type: `${result.scenario}-provider`, description: result.provider },
    { type: `${result.scenario}-model`, description: result.model },
    { type: `${result.scenario}-request-id`, description: result.requestId },
  );

  const body = liveAiDiagnostic(result);
  const artifactDir =
    process.env.AI_EVAL_ARTIFACT_DIR ?? join(process.cwd(), 'test-results', 'ai-live-evidence');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, `${result.scenario}-live-ai-eval.json`), body);

  await testInfo.attach(`${result.scenario}-live-ai-eval.json`, {
    body,
    contentType: 'application/json',
  });
}

export async function navigateToEvalBookReader(page: Page, book: EvalBookConfig) {
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'All Books' })).toBeVisible({ timeout: 45_000 });

  const search = page.getByTestId('search-input');
  if (await search.isVisible().catch(() => false)) {
    await search.fill(book.titlePattern.source.replace(/\\/g, ''));
  }

  const link = page.getByRole('link', { name: book.titlePattern }).first();
  await expect(link).toBeVisible({ timeout: 60_000 });
  await link.click();

  await page.waitForURL(
    (url) => url.pathname.startsWith('/reader') && url.search.includes(book.hash),
    { timeout: 45_000 },
  );

  const inlineInput = page.getByPlaceholder('Ask about this book...').first();
  await expect(inlineInput).toBeVisible({ timeout: 60_000 });
  return inlineInput;
}

export async function importCatalogSearchResultAndOpenReader(page: Page, query: string) {
  const configuredCatalogBookId = process.env.AI_EVAL_CATALOG_BOOK_ID;

  if (configuredCatalogBookId && process.env.AI_EVAL_CATALOG_OPEN_FROM_LIBRARY === '1') {
    await navigateToEvalBookReader(page, {
      hash: `catalog:${configuredCatalogBookId}`,
      titlePattern: new RegExp(query, 'i'),
    });

    return {
      title: query,
      importedBookHash: `catalog:${configuredCatalogBookId}`,
      inlineInput: page.getByPlaceholder('Ask about this book...').first(),
    };
  }

  await page.goto('/explore', { waitUntil: 'domcontentloaded' });

  const search = page.getByPlaceholder('Books, authors, subjects...');
  await expect(search).toBeVisible({ timeout: 45_000 });
  await search.fill(query);
  await expect(page.getByTestId('search-results-grid')).toBeVisible({ timeout: 60_000 });

  const card = configuredCatalogBookId
    ? page.getByTestId(`card-tap-${configuredCatalogBookId}`)
    : page.locator('[data-testid^="card-tap-"]').first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.click();

  const sheet = page.getByTestId('book-detail-sheet');
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  const title = (await sheet.getByTestId('sheet-title').innerText()).trim();
  expect(title.length).toBeGreaterThan(0);

  const readButton = sheet.getByTestId('sheet-read-btn');
  const importButton = sheet.getByTestId('sheet-import-btn');
  let importedBookHash: string | null = null;

  if (await importButton.isVisible().catch(() => false)) {
    const importResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/api\/catalog\/(books\/[^/]+|ia)\/import$/.test(new URL(response.url()).pathname),
      { timeout: 120_000 },
    );
    await importButton.click();
    const importResponse = await importResponsePromise;
    expect(importResponse.ok()).toBe(true);
    const payload = (await importResponse.json()) as Record<string, unknown>;
    importedBookHash = typeof payload.book_hash === 'string' ? payload.book_hash : null;
  }

  await expect(readButton).toBeVisible({ timeout: 120_000 });
  await readButton.click();
  await page.waitForURL((url) => url.pathname.startsWith('/reader'), { timeout: 60_000 });

  const inlineInput = page.getByPlaceholder('Ask about this book...').first();
  await expect(inlineInput).toBeVisible({ timeout: 60_000 });

  return { title, importedBookHash, inlineInput };
}

export async function askLiveReaderQuestion(
  page: Page,
  scenario: string,
  question: string,
  timeoutMs = liveEvalTimeoutMs(),
): Promise<LiveAiChatResult> {
  const requestBodies: Record<string, unknown>[] = [];
  let aiHeaders: Record<string, string> = {};

  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().includes('/api/ai/agentic-chat')) return;
    try {
      requestBodies.push(request.postDataJSON() as Record<string, unknown>);
    } catch {
      requestBodies.push({ rawPostData: request.postData() ?? '' });
    }
  });

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().includes('/api/ai/agentic-chat'),
    { timeout: 45_000 },
  );

  const inlineInput = page.getByPlaceholder('Ask about this book...').first();
  await inlineInput.click();
  await inlineInput.fill(question);

  const userMessageCountBefore = await userMessageCount(page);
  const assistantMessageCountBefore = await assistantMessageCount(page);
  const submitAt = Date.now();
  await inlineInput.press('Enter');

  const aiResponse = await responsePromise;
  expect(aiResponse.ok()).toBe(true);
  aiHeaders = await aiResponse.allHeaders();

  let firstTokenMs: number | null = null;
  let completeMs: number | null = null;
  let answer = '';
  let lastLength = 0;
  let stableCount = 0;

  while (Date.now() - submitAt < timeoutMs) {
    const candidate = await latestSubmittedAssistantResponse(page, {
      userMessageCountBefore,
      assistantMessageCountBefore,
    }).catch(() => '');
    if (candidate.length > 30 && firstTokenMs === null) firstTokenMs = Date.now() - submitAt;
    if (candidate.length > answer.length) answer = candidate;

    if (candidate.length > 30 && candidate.length === lastLength) {
      stableCount += 1;
      if (stableCount >= 3) {
        completeMs = Date.now() - submitAt;
        answer = candidate;
        break;
      }
    } else {
      stableCount = 0;
      lastLength = candidate.length;
    }

    await page.waitForTimeout(750);
  }

  return {
    scenario,
    question,
    answer,
    responseLength: answer.length,
    firstTokenMs,
    completeMs,
    tier: aiHeaders['x-openread-ai-planner-tier'] ?? 'unknown',
    provider: aiHeaders['x-openread-ai-chat-provider'] ?? 'unknown',
    model: aiHeaders['x-openread-ai-chat-model'] ?? 'unknown',
    requestId: aiHeaders['x-openread-ai-request-id'] ?? 'unknown',
    requestBody: summarizeRequestBody(requestBodies.at(-1) ?? null),
    userMessageCountBefore,
    assistantMessageCountBefore,
    assistantMessageCountAfter: await assistantMessageCount(page),
  };
}

export function expectUsefulLiveAnswer(result: LiveAiChatResult) {
  const diagnostic = liveAiDiagnostic(result);
  const lastUserMessage = String(result.requestBody?.lastUserMessage ?? '');

  expect(result.responseLength, diagnostic).toBeGreaterThan(80);
  expect(result.responseLength, diagnostic).toBeLessThan(8_000);
  expect(/[a-zA-Z]{4,}/.test(result.answer), diagnostic).toBe(true);
  expect(
    /\b(I (do not|don't|cannot|can't) (have|access|see)|no book context|unable to access)\b/i.test(
      result.answer,
    ),
    diagnostic,
  ).toBe(false);
  expect(lastUserMessage.includes(result.question), diagnostic).toBe(true);
  expect(result.firstTokenMs, diagnostic).not.toBeNull();
  if (result.firstTokenMs !== null) {
    expect(result.firstTokenMs, diagnostic).toBeLessThan(45_000);
  }
  expect(result.completeMs, diagnostic).not.toBeNull();
  expect(result.provider, diagnostic).not.toBe('unknown');
  expect(result.model, diagnostic).not.toBe('unknown');
  expect(result.requestId, diagnostic).not.toBe('unknown');
  expect(result.tier, diagnostic).not.toBe('unknown');
  expect(result.assistantMessageCountAfter, diagnostic).toBeGreaterThan(
    result.assistantMessageCountBefore,
  );
}

export function expectNotFullPromptTier(result: LiveAiChatResult) {
  const diagnostic = liveAiDiagnostic(result);
  expect(result.tier, diagnostic).not.toBe('unknown');
  expect(result.tier, diagnostic).not.toBe('full');
}

function summarizeRequestBody(
  requestBody: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!requestBody) return null;

  const messages = Array.isArray(requestBody.messages) ? requestBody.messages : [];
  const chapters = Array.isArray(requestBody.chapters) ? requestBody.chapters : [];
  const visualContextImages = Array.isArray(requestBody.visualContextImages)
    ? requestBody.visualContextImages
    : [];

  return {
    provider: requestBody.provider,
    model: requestBody.model,
    bookHash: requestBody.bookHash,
    bookTitle: requestBody.bookTitle,
    authorName: requestBody.authorName,
    bookFormat: requestBody.bookFormat,
    currentPage: requestBody.currentPage,
    sectionHref: requestBody.sectionHref,
    sectionFraction: requestBody.sectionFraction,
    messageCount: messages.length,
    lastUserMessage: lastUserMessageContent({ messages }),
    chaptersCount: chapters.length,
    chapterTextCharCount: chapters.reduce(
      (total, chapter) =>
        total +
        (typeof chapter === 'object' &&
        chapter !== null &&
        typeof (chapter as { text?: unknown }).text === 'string'
          ? (chapter as { text: string }).text.length
          : 0),
      0,
    ),
    visualContextImageCount: visualContextImages.length,
  };
}

function lastUserMessageContent(requestBody: Record<string, unknown> | null): string {
  const messages = requestBody?.messages;
  if (!Array.isArray(messages)) return '';

  const lastUserMessage = messages
    .filter(
      (message): message is { role: string; content: unknown } =>
        typeof message === 'object' &&
        message !== null &&
        'role' in message &&
        'content' in message &&
        (message as { role: unknown }).role === 'user',
    )
    .at(-1);

  return typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';
}

async function userMessageCount(page: Page): Promise<number> {
  return page.locator('[data-message-role="user"]').count();
}

async function assistantMessageCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const assistantText = (element: Element | undefined | null): string =>
      ((element as HTMLElement | undefined)?.innerText ?? '')
        .replace(/AI can make mistakes\. Verify with the book\./g, '')
        .trim();

    const explicitMessages = Array.from(
      document.querySelectorAll('[data-message-role="assistant"]'),
    );
    if (explicitMessages.length > 0) return explicitMessages.length;

    return Array.from(document.querySelectorAll('[data-message-role="user"]')).filter((user) => {
      let candidate = user.nextElementSibling;
      while (candidate && !candidate.matches('[data-message-role="user"]')) {
        if (assistantText(candidate).length > 0) return true;
        candidate = candidate.nextElementSibling;
      }
      return false;
    }).length;
  });
}

async function latestSubmittedAssistantResponse(
  page: Page,
  countsBefore: { userMessageCountBefore: number; assistantMessageCountBefore: number },
): Promise<string> {
  return page.evaluate(({ userMessageCountBefore, assistantMessageCountBefore }) => {
    const assistantText = (element: Element | undefined | null): string =>
      ((element as HTMLElement | undefined)?.innerText ?? '')
        .replace(/AI can make mistakes\. Verify with the book\./g, '')
        .trim();

    const explicitMessages = Array.from(
      document.querySelectorAll('[data-message-role="assistant"]'),
    );
    if (explicitMessages.length > assistantMessageCountBefore) {
      const submittedMessages = explicitMessages.slice(assistantMessageCountBefore);
      return assistantText(submittedMessages.at(-1));
    }

    const users = Array.from(document.querySelectorAll('[data-message-role="user"]'));
    const submittedUsers = users.slice(userMessageCountBefore);
    const latestUser = submittedUsers.at(-1);
    if (!latestUser) return '';

    let candidate = latestUser.nextElementSibling;
    while (candidate && !candidate.matches('[data-message-role="user"]')) {
      const text = assistantText(candidate);
      if (text.length > 0) return text;
      candidate = candidate.nextElementSibling;
    }

    return '';
  }, countsBefore);
}
