import type { TestInfo } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachLiveEvalResult,
  liveAiDiagnostic,
  type LiveAiChatResult,
} from '../../../e2e/ai-live/helpers';

const QUESTION_SENTINEL = 'QUESTION_CONTENT_MUST_STAY_IN_MEMORY';
const ANSWER_SENTINEL = 'ANSWER_CONTENT_MUST_STAY_IN_MEMORY';
const UNPUBLISHED_SENTINEL = 'UNPUBLISHED_REQUEST_DATA_MUST_NOT_ESCAPE';

const result: LiveAiChatResult = {
  scenario: 'artifact-safety',
  question: QUESTION_SENTINEL,
  answer: ANSWER_SENTINEL,
  responseLength: ANSWER_SENTINEL.length,
  firstTokenMs: 120,
  completeMs: 480,
  tier: 'incremental',
  provider: 'test-provider',
  model: 'test-model',
  requestId: 'test-request-id',
  requestBody: {
    provider: 'test-provider',
    model: 'test-model',
    bookHash: 'catalog:00000000-0000-0000-0000-000000000000',
    bookTitle: 'Committed public-domain fixture',
    authorName: 'Fixture author',
    bookFormat: 'epub',
    currentPage: 4,
    sectionHref: 'chapter-1.xhtml',
    sectionFraction: 0.5,
    messageCount: 1,
    lastUserMessage: QUESTION_SENTINEL,
    chaptersCount: 2,
    chapterTextCharCount: 321,
    visualContextImageCount: 0,
    unpublishedField: UNPUBLISHED_SENTINEL,
  },
  userMessageCountBefore: 2,
  assistantMessageCountBefore: 1,
  assistantMessageCountAfter: 2,
};

let artifactDir: string | undefined;

afterEach(async () => {
  delete process.env.AI_EVAL_ARTIFACT_DIR;
  if (artifactDir) await rm(artifactDir, { recursive: true, force: true });
  artifactDir = undefined;
});

describe('live AI evidence attachments', () => {
  it('publishes only allowlisted metadata while content remains in memory', async () => {
    artifactDir = await mkdtemp(join(tmpdir(), 'openread-ai-evidence-'));
    process.env.AI_EVAL_ARTIFACT_DIR = artifactDir;
    const attach = vi.fn();
    const testInfo = { annotations: [], attach } as unknown as TestInfo;

    await attachLiveEvalResult(testInfo, result);

    const body = await readFile(join(artifactDir, 'artifact-safety-live-ai-eval.json'), 'utf8');
    const artifact = JSON.parse(body);

    expect(artifact).toEqual({
      scenario: 'artifact-safety',
      responseLength: ANSWER_SENTINEL.length,
      firstTokenMs: 120,
      completeMs: 480,
      tier: 'incremental',
      provider: 'test-provider',
      model: 'test-model',
      requestId: 'test-request-id',
      requestBody: {
        provider: 'test-provider',
        model: 'test-model',
        bookHash: 'catalog:00000000-0000-0000-0000-000000000000',
        bookFormat: 'epub',
        currentPage: 4,
        sectionFraction: 0.5,
        messageCount: 1,
        lastUserMessageLength: QUESTION_SENTINEL.length,
        chaptersCount: 2,
        chapterTextCharCount: 321,
        visualContextImageCount: 0,
      },
      submittedQuestionMatched: true,
      userMessageCountBefore: 2,
      assistantMessageCountBefore: 1,
      assistantMessageCountAfter: 2,
    });
    expect(liveAiDiagnostic(result)).toBe(body);
    expect(body).not.toContain(QUESTION_SENTINEL);
    expect(body).not.toContain(ANSWER_SENTINEL);
    expect(body).not.toContain(UNPUBLISHED_SENTINEL);
    expect(artifact.requestBody).not.toHaveProperty('lastUserMessage');
    expect(body).not.toContain('bookTitle');
    expect(body).not.toContain('authorName');
    expect(body).not.toContain('sectionHref');
    expect(attach).toHaveBeenCalledWith('artifact-safety-live-ai-eval.json', {
      body,
      contentType: 'application/json',
    });
  });
});
