export type LiveAiChatResult = {
  scenario: string;
  question: string;
  answer: string;
  responseLength: number;
  firstTokenMs: number | null;
  completeMs: number | null;
  tier: string;
  provider: string;
  model: string;
  requestId: string;
  requestBody: Record<string, unknown> | null;
  userMessageCountBefore: number;
  assistantMessageCountBefore: number;
  assistantMessageCountAfter: number;
};

export type PublishableLiveAiResult = {
  scenario: string;
  responseLength: number;
  firstTokenMs: number | null;
  completeMs: number | null;
  tier: string;
  provider: string;
  model: string;
  requestId: string;
  requestBody: Record<string, unknown> | null;
  submittedQuestionMatched: boolean;
  userMessageCountBefore: number;
  assistantMessageCountBefore: number;
  assistantMessageCountAfter: number;
};

export function publishableLiveAiResult(result: LiveAiChatResult): PublishableLiveAiResult {
  const lastUserMessage =
    typeof result.requestBody?.lastUserMessage === 'string'
      ? result.requestBody.lastUserMessage
      : '';

  return {
    scenario: result.scenario,
    responseLength: result.responseLength,
    firstTokenMs: result.firstTokenMs,
    completeMs: result.completeMs,
    tier: result.tier,
    provider: result.provider,
    model: result.model,
    requestId: result.requestId,
    requestBody: publishableRequestMetadata(result.requestBody, lastUserMessage.length),
    submittedQuestionMatched:
      result.question.length > 0 && lastUserMessage.includes(result.question),
    userMessageCountBefore: result.userMessageCountBefore,
    assistantMessageCountBefore: result.assistantMessageCountBefore,
    assistantMessageCountAfter: result.assistantMessageCountAfter,
  };
}

export function liveAiDiagnostic(result: LiveAiChatResult): string {
  return JSON.stringify(publishableLiveAiResult(result), null, 2);
}

function publishableRequestMetadata(
  requestBody: Record<string, unknown> | null,
  lastUserMessageLength: number,
): Record<string, unknown> | null {
  if (!requestBody) return null;

  return {
    provider: requestBody.provider,
    model: requestBody.model,
    bookHash: requestBody.bookHash,
    bookFormat: requestBody.bookFormat,
    currentPage: requestBody.currentPage,
    sectionFraction: requestBody.sectionFraction,
    messageCount: requestBody.messageCount,
    lastUserMessageLength,
    chaptersCount: requestBody.chaptersCount,
    chapterTextCharCount: requestBody.chapterTextCharCount,
    visualContextImageCount: requestBody.visualContextImageCount,
  };
}
