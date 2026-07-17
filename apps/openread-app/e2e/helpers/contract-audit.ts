import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { ConsoleMessage, Page, Request, Response, TestInfo } from '@playwright/test';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const READ_ONLY_PRODUCT_POST_PATHS = new Set([
  '/api/files/download-intent',
  '/api/sync/bootstrap',
  '/api/sync/pull',
  '/api/sync/reconcile',
]);
const ALLOWED_ERROR_NAMES = new Set([
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
]);
const DEFAULT_MAX_NETWORK_EVENTS = 1_000;
const DEFAULT_MAX_ERROR_EVENTS = 100;
const DEFAULT_ATTACH_BUDGET_MS = 2_000;

export type ContractNetworkEvent = {
  sequence: number;
  method: string;
  host: string;
  pathSha256: string;
  resourceType: string;
  category: 'auth' | 'product' | 'telemetry' | 'external';
  effect: 'read' | 'write' | 'unknown';
  status: number | null;
  outcome: 'pending' | 'response' | 'failed';
  failureSha256?: string;
};

export type ContractErrorEvent = {
  type: 'console-error' | 'console-warning' | 'page-error';
  name: string;
  detailSha256: string;
};

export type ContractAuditSnapshot = {
  schemaVersion: 1;
  network: ContractNetworkEvent[];
  consoleEvents: ContractErrorEvent[];
  pageErrors: ContractErrorEvent[];
  dropped: {
    network: number;
    console: number;
    pageErrors: number;
  };
};

export type ContractAudit = ReturnType<typeof startContractAudit>;

type AuditOptions = {
  maxNetworkEvents?: number;
  maxErrorEvents?: number;
};

export function hashContractEvidence(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalHost(url: URL): string {
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'localhost';
  if (hostname.endsWith('.supabase.co')) return 'supabase.co';
  if (hostname.endsWith('.r2.cloudflarestorage.com')) return 'r2.cloudflarestorage.com';
  if (hostname.endsWith('.sentry.io')) return 'sentry.io';
  if (hostname === 'app.openread.ai' || hostname === 'api.openread.ai') return hostname;
  return 'external';
}

function requestCategory(url: URL, host: string): ContractNetworkEvent['category'] {
  if (url.pathname.startsWith('/auth/v1/')) return 'auth';
  if (host === 'sentry.io' || url.pathname.startsWith('/_vercel/insights')) {
    return 'telemetry';
  }
  const appProductPath = url.pathname.startsWith('/api/') || url.pathname.startsWith('/sync');
  const supabaseProductPath =
    url.pathname.startsWith('/rest/v1/') ||
    url.pathname.startsWith('/storage/v1/') ||
    url.pathname.startsWith('/graphql/v1/');
  if (
    host === 'api.openread.ai' ||
    ((host === 'app.openread.ai' || host === 'localhost') && appProductPath) ||
    (host === 'supabase.co' && supabaseProductPath) ||
    host === 'r2.cloudflarestorage.com'
  ) {
    return 'product';
  }
  return 'external';
}

function requestEffect(
  method: string,
  category: ContractNetworkEvent['category'],
  pathname: string,
): ContractNetworkEvent['effect'] {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return 'read';
  if (category !== 'product') return 'unknown';
  if (method === 'POST' && READ_ONLY_PRODUCT_POST_PATHS.has(pathname)) return 'read';
  return MUTATION_METHODS.has(method) ? 'write' : 'unknown';
}

function sanitizedErrorName(name: string): string {
  return ALLOWED_ERROR_NAMES.has(name) ? name : 'Error';
}

function sanitizedRequest(request: Request, sequence: number): ContractNetworkEvent | null {
  let url: URL;
  try {
    url = new URL(request.url());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = canonicalHost(url);
  const method = request.method().toUpperCase();
  const category = requestCategory(url, host);
  return {
    sequence,
    method,
    host,
    pathSha256: hashContractEvidence(url.pathname),
    resourceType: request.resourceType(),
    category,
    effect: requestEffect(method, category, url.pathname),
    status: null,
    outcome: 'pending',
  };
}

export function startContractAudit(page: Page, options: AuditOptions = {}) {
  const maxNetworkEvents = options.maxNetworkEvents ?? DEFAULT_MAX_NETWORK_EVENTS;
  const maxErrorEvents = options.maxErrorEvents ?? DEFAULT_MAX_ERROR_EVENTS;
  const network: ContractNetworkEvent[] = [];
  const consoleEvents: ContractErrorEvent[] = [];
  const pageErrors: ContractErrorEvent[] = [];
  const requestIndexes = new WeakMap<Request, number>();
  const dropped = { network: 0, console: 0, pageErrors: 0 };
  let stopped = false;

  const onRequest = (request: Request) => {
    if (network.length >= maxNetworkEvents) {
      dropped.network += 1;
      return;
    }
    const event = sanitizedRequest(request, network.length + 1);
    if (!event) return;
    requestIndexes.set(request, network.length);
    network.push(event);
  };

  const onResponse = (response: Response) => {
    const index = requestIndexes.get(response.request());
    if (index === undefined) return;
    network[index] = { ...network[index], status: response.status(), outcome: 'response' };
  };

  const onRequestFailed = (request: Request) => {
    const index = requestIndexes.get(request);
    if (index === undefined) return;
    network[index] = {
      ...network[index],
      outcome: 'failed',
      failureSha256: hashContractEvidence(request.failure()?.errorText ?? 'unknown'),
    };
  };

  const onConsole = (message: ConsoleMessage) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    if (consoleEvents.length >= maxErrorEvents) {
      dropped.console += 1;
      return;
    }
    consoleEvents.push({
      type: message.type() === 'error' ? 'console-error' : 'console-warning',
      name: 'Error',
      detailSha256: hashContractEvidence(message.text()),
    });
  };

  const onPageError = (error: Error) => {
    if (pageErrors.length >= maxErrorEvents) {
      dropped.pageErrors += 1;
      return;
    }
    pageErrors.push({
      type: 'page-error',
      name: sanitizedErrorName(error.name),
      detailSha256: hashContractEvidence(error.message),
    });
  };

  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    page.off('request', onRequest);
    page.off('response', onResponse);
    page.off('requestfailed', onRequestFailed);
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  };

  const snapshot = (): ContractAuditSnapshot => ({
    schemaVersion: 1,
    network: network.map((event) => ({ ...event })),
    consoleEvents: consoleEvents.map((event) => ({ ...event })),
    pageErrors: pageErrors.map((event) => ({ ...event })),
    dropped: { ...dropped },
  });

  const assertNoProductMutations = () => {
    const mutations = network.filter(
      (event) => event.category === 'product' && event.effect === 'write',
    );
    if (mutations.length > 0) {
      throw new Error(`PRODUCT_MUTATION_REQUESTS_DETECTED:${mutations.length}`);
    }
  };

  const assertNoRuntimeErrors = () => {
    const errorCount =
      pageErrors.length + consoleEvents.filter((event) => event.type === 'console-error').length;
    if (errorCount > 0) throw new Error(`RUNTIME_ERROR_EVENTS_DETECTED:${errorCount}`);
  };

  const assertComplete = () => {
    const droppedCount = dropped.network + dropped.console + dropped.pageErrors;
    if (droppedCount > 0) throw new Error(`CONTRACT_AUDIT_EVENTS_DROPPED:${droppedCount}`);
  };

  return {
    stop,
    snapshot,
    assertComplete,
    assertNoProductMutations,
    assertNoRuntimeErrors,
  };
}

export function buildContractAuditArtifact(
  audit: ContractAudit,
  metadata: Record<string, unknown> = {},
): ContractAuditSnapshot & Record<string, unknown> {
  return { ...metadata, ...audit.snapshot() };
}

export function assertContractAudit(
  audit: ContractAudit,
  options: { runtimeErrors?: boolean } = {},
): void {
  audit.assertComplete();
  audit.assertNoProductMutations();
  if (options.runtimeErrors) audit.assertNoRuntimeErrors();
}

async function runWithBudget<T>(operation: Promise<T>, budgetMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('CONTRACT_AUDIT_ATTACHMENT_TIMEOUT')), budgetMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function persistContractAudit(
  testInfo: TestInfo,
  audit: ContractAudit,
  metadata: Record<string, unknown> = {},
  attachBudgetMs = DEFAULT_ATTACH_BUDGET_MS,
): Promise<void> {
  const outputPath = testInfo.outputPath('contract-audit.json');
  writeFileSync(
    outputPath,
    `${JSON.stringify(buildContractAuditArtifact(audit, { metadata }), null, 2)}\n`,
    'utf8',
  );
  await runWithBudget(
    testInfo.attach('contract-audit', {
      path: outputPath,
      contentType: 'application/json',
    }),
    attachBudgetMs,
  );
}
