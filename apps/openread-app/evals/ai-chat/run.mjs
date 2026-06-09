#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { JEKYLL_HYDE_FIXTURE } from './fixtures.mjs';

const baseUrl = (process.env.AI_EVAL_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const artifactDir = path.resolve(
  process.cwd(),
  process.env.AI_EVAL_ARTIFACT_DIR ?? 'test-results/ai-chat-quality-evidence',
);
const provider = process.env.AI_EVAL_PROVIDER ?? 'groq';
const model = process.env.AI_EVAL_MODEL ?? 'openai/gpt-oss-20b';
const responseTimeoutMs = Number(process.env.AI_EVAL_RESPONSE_TIMEOUT_MS ?? 120_000);
const firstTokenTimeoutMs = Number(process.env.AI_EVAL_FIRST_TOKEN_TIMEOUT_MS ?? 45_000);

const unsupportedContextPattern =
  /\b(does\s+not|doesn.t|not\s+enough|not\s+provide|not\s+about|no\s+evidence|contains?\s+no\s+information|no\s+information\s+about|does\s+not\s+contain|isn.t\s+covered|is\s+not\s+covered|outside\s+(?:the\s+)?(?:book|context)|not\s+supported\s+by\s+(?:the\s+)?(?:book|context))\b/i;

const scenarios = [
  {
    id: 'api-quality-fiction-conflict',
    question:
      'In The Strange Case of Dr Jekyll and Mr Hyde, what central conflict does Dr. Jekyll embody? Mention Jekyll and Hyde.',
    required: [/Jekyll/i, /Hyde/i, /dual|split|conflict|nature|identity|darker/i],
  },
  {
    id: 'api-quality-fiction-summary',
    question:
      'What is The Strange Case of Dr Jekyll and Mr Hyde broadly about? Mention the transformation or double identity in a concise answer.',
    required: [/Jekyll/i, /Hyde/i, /transform|identity|double|dual/i],
  },
  {
    id: 'api-quality-out-of-scope-uncertainty',
    question:
      'Does this book provide Kubernetes deployment strategies? If the book context does not support that, say so and redirect to what the book is actually about.',
    required: [unsupportedContextPattern, /Jekyll|Hyde|Gothic|identity|morality/i],
    forbidden: [/kubectl|deployment yaml|cluster rollout|helm chart/i],
    allowUncertaintyLanguage: true,
  },
  {
    id: 'api-quality-multiturn-follow-up',
    messages: [
      {
        role: 'user',
        content: 'Name three recurring ideas from this book in short bullet points.',
      },
      {
        role: 'assistant',
        content: 'Dual identity, moral responsibility, and the danger of hidden impulses.',
      },
      {
        role: 'user',
        content: 'Of those ideas, which one is most central, and why?',
      },
    ],
    required: [/dual|identity|Jekyll|Hyde/i, /central|most important|because|why/i],
  },
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

async function resolveAccessToken() {
  if (process.env.AI_EVAL_ACCESS_TOKEN) return process.env.AI_EVAL_ACCESS_TOKEN;

  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.auth.signInWithPassword({
    email: requireEnv('TEST_USER_EMAIL'),
    password: requireEnv('TEST_USER_PASSWORD'),
  });
  if (error || !data.session?.access_token) {
    throw new Error(`Could not sign in eval user: ${error?.message ?? 'missing session'}`);
  }
  return data.session.access_token;
}

function scenarioMessages(scenario) {
  return scenario.messages ?? [{ role: 'user', content: scenario.question }];
}

function latestUserQuestion(messages) {
  return [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
}

async function readNdjsonStream(response, startedAt) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  let buffer = '';
  let answerFromDeltas = '';
  let finalText = '';
  let firstTokenMs = null;
  const events = [];

  while (Date.now() - startedAt < responseTimeoutMs) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const event = JSON.parse(line);
      events.push(event);
      if (event.type === 'text-delta' && typeof event.text === 'string') {
        answerFromDeltas += event.text;
        firstTokenMs ??= Date.now() - startedAt;
      }
      if (event.type === 'text' && typeof event.text === 'string') {
        finalText = event.text;
        firstTokenMs ??= Date.now() - startedAt;
      }
    }
  }

  return {
    events,
    answer: finalText || answerFromDeltas,
    firstTokenMs,
    completeMs: Date.now() - startedAt,
    sawFinalText: Boolean(finalText),
    sawError: events.some((event) => event.type === 'error'),
  };
}

function expect(condition, message, evidence) {
  if (!condition) {
    const detail = evidence ? `\n${JSON.stringify(evidence, null, 2)}` : '';
    throw new Error(`${message}${detail}`);
  }
}

function assertScenario(result, scenario) {
  expect(result.status >= 200 && result.status < 300, 'agentic-chat response was not ok', result);
  expect(result.sawFinalText, 'stream did not emit final text event', result);
  expect(!result.sawError, 'stream emitted an error event', result);
  expect(result.firstTokenMs !== null, 'stream did not emit a first token', result);
  expect(result.firstTokenMs <= firstTokenTimeoutMs, 'first token exceeded latency budget', result);
  expect(result.answer.length >= 80, 'answer was too short', result);
  expect(result.answer.length <= 8_000, 'answer was too long', result);
  expect(/[a-zA-Z]{4,}/.test(result.answer), 'answer did not contain readable text', result);
  if (!scenario.allowUncertaintyLanguage) {
    expect(
      !/\b(I (do not|don't|cannot|can't) (have|access|see)|no book context|unable to access)\b/i.test(
        result.answer,
      ),
      'answer used generic no-context language for a grounded scenario',
      result,
    );
  }
  expect(result.provider !== 'unknown', 'missing provider header', result);
  expect(result.model !== 'unknown', 'missing model header', result);
  expect(result.requestId !== 'unknown', 'missing request id header', result);
  expect(result.tier !== 'unknown', 'missing planner tier header', result);
  expect(
    result.requestBody.bookHash === JEKYLL_HYDE_FIXTURE.bookHash,
    'fixture bookHash drifted',
    result,
  );

  for (const pattern of scenario.required ?? []) {
    expect(pattern.test(result.answer), `answer did not match required pattern ${pattern}`, result);
  }
  for (const pattern of scenario.forbidden ?? []) {
    expect(!pattern.test(result.answer), `answer matched forbidden pattern ${pattern}`, result);
  }
}

async function runScenario(accessToken, scenario) {
  const messages = scenarioMessages(scenario);
  const requestBody = {
    messages,
    provider,
    model,
    chapters: JEKYLL_HYDE_FIXTURE.chapters,
    currentPage: JEKYLL_HYDE_FIXTURE.currentPage,
    bookHash: JEKYLL_HYDE_FIXTURE.bookHash,
    bookTitle: JEKYLL_HYDE_FIXTURE.bookTitle,
    authorName: JEKYLL_HYDE_FIXTURE.authorName,
    bookFormat: JEKYLL_HYDE_FIXTURE.bookFormat,
    sectionHref: JEKYLL_HYDE_FIXTURE.sectionHref,
    sectionFraction: JEKYLL_HYDE_FIXTURE.sectionFraction,
  };

  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/ai/agentic-chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(responseTimeoutMs),
  });

  const stream = response.ok
    ? await readNdjsonStream(response, startedAt)
    : {
        events: [],
        answer: await response.text(),
        firstTokenMs: null,
        completeMs: Date.now() - startedAt,
        sawFinalText: false,
        sawError: true,
      };

  const result = {
    scenario: scenario.id,
    question: scenario.question ?? latestUserQuestion(messages),
    answer: stream.answer,
    responseLength: stream.answer.length,
    firstTokenMs: stream.firstTokenMs,
    completeMs: stream.completeMs,
    sawFinalText: stream.sawFinalText,
    sawError: stream.sawError,
    status: response.status,
    tier: response.headers.get('x-openread-ai-planner-tier') ?? 'unknown',
    provider: response.headers.get('x-openread-ai-chat-provider') ?? 'unknown',
    model: response.headers.get('x-openread-ai-chat-model') ?? 'unknown',
    requestId: response.headers.get('x-openread-ai-request-id') ?? 'unknown',
    eventTypes: stream.events.map((event) => event.type),
    requestBody: {
      provider: requestBody.provider,
      model: requestBody.model,
      bookHash: requestBody.bookHash,
      bookTitle: requestBody.bookTitle,
      authorName: requestBody.authorName,
      messageCount: messages.length,
      lastUserMessage: latestUserQuestion(messages),
      chaptersCount: requestBody.chapters.length,
      chapterTextCharCount: requestBody.chapters.reduce(
        (sum, chapter) => sum + chapter.text.length,
        0,
      ),
    },
  };

  assertScenario(result, scenario);
  await writeFile(path.join(artifactDir, `${scenario.id}.json`), JSON.stringify(result, null, 2));
  return result;
}

await mkdir(artifactDir, { recursive: true });
const accessToken = await resolveAccessToken();
const results = [];
for (const scenario of scenarios) {
  const result = await runScenario(accessToken, scenario);
  results.push(result);
  console.log(
    `✓ ${result.scenario} len=${result.responseLength} first=${result.firstTokenMs}ms complete=${result.completeMs}ms tier=${result.tier} model=${result.model}`,
  );
}

await writeFile(
  path.join(artifactDir, 'summary.json'),
  JSON.stringify({ baseUrl, results }, null, 2),
);
console.log(`\n${results.length} AI chat quality API evals passed`);
