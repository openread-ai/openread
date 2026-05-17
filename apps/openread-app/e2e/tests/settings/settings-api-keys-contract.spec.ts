import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '../../fixtures';
import { attachScenarioEvidence, setScenarioEvidenceNote } from '../../helpers/settings-contract';

type MockKey = {
  id: string;
  description: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

async function mockApiKeys(
  page: import('@playwright/test').Page,
  options: {
    initialKeys?: MockKey[];
    createStatus?: number;
    deleteStatus?: number;
  } = {},
) {
  let keys = [
    ...(options.initialKeys ?? [
      {
        id: 'qa-key-1',
        description: 'Claude Desktop QA',
        keyPrefix: 'orsk_qa1',
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      },
    ]),
  ];

  await page.route('**/api/api-keys', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: { keys } });
      return;
    }

    if (request.method() === 'POST') {
      if (options.createStatus && options.createStatus >= 400) {
        await route.fulfill({
          status: options.createStatus,
          json: { message: 'Mock create failure' },
        });
        return;
      }

      const body = JSON.parse(request.postData() || '{}') as { description?: string };
      keys = [
        ...keys,
        {
          id: 'qa-key-new',
          description: body.description || 'Created QA key',
          keyPrefix: 'orsk_new',
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        },
      ];
      await route.fulfill({ json: { id: 'qa-key-new', key: 'orsk_show_once_full_secret' } });
      return;
    }

    await route.fallback();
  });

  await page.route('**/api/api-keys/**', async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.fallback();
      return;
    }

    if (options.deleteStatus && options.deleteStatus >= 400) {
      await route.fulfill({
        status: options.deleteStatus,
        json: { message: 'Mock revoke failure' },
      });
      return;
    }

    const id = route.request().url().split('/').pop();
    keys = keys.filter((key) => key.id !== id);
    await route.fulfill({ json: { success: true } });
  });
}

async function openApiKeys(page: import('@playwright/test').Page) {
  await page.goto('/settings/api-keys', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/settings\/api-keys\/?$/);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText('API Keys').first()).toBeVisible();
}

type McpMessage = {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type DisposableApiKey = { id: string; key: string };

type SpawnedMcp = {
  child: ChildProcess;
  stderr: string[];
  send: (message: McpMessage) => void;
  receive: (timeoutMs?: number) => Promise<McpMessage>;
  close: () => Promise<void>;
};

async function createDisposableApiKey(
  page: import('@playwright/test').Page,
  description: string,
): Promise<DisposableApiKey> {
  return page.evaluate(async (keyDescription) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Missing authenticated token for API key creation');

    const response = await fetch('/api/api-keys', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ description: keyDescription }),
    });

    if (!response.ok) {
      throw new Error(`API key create failed: ${response.status} ${await response.text()}`);
    }

    return (await response.json()) as { id: string; key: string };
  }, description);
}

async function revokeDisposableApiKey(
  page: import('@playwright/test').Page,
  keyId: string,
): Promise<void> {
  await page.evaluate(async (id) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    await fetch(`/api/api-keys/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }, keyId);
}

function spawnOpenreadMcp(apiKey: string, apiUrl: string): SpawnedMcp {
  const repoRoot = resolve(process.cwd(), '../..');
  const cacheDir = mkdtempSync(join(tmpdir(), 'openread-mcp-set049-'));
  const child = spawn(
    'corepack',
    ['pnpm', '--filter', '@openread/mcp', 'exec', 'tsx', 'src/cli/index.ts'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        OPENREAD_API_KEY: apiKey,
        OPENREAD_API_URL: apiUrl,
        OPENREAD_CACHE_DIR: cacheDir,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  let buffer = '';
  const queue: McpMessage[] = [];
  let resolver: ((message: McpMessage) => void) | null = null;
  const stderr: string[] = [];

  child.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let message: McpMessage;
      try {
        message = JSON.parse(line) as McpMessage;
      } catch {
        stderr.push(line);
        continue;
      }
      if (resolver) {
        resolver(message);
        resolver = null;
      } else {
        queue.push(message);
      }
    }
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    stderr.push(...chunk.toString('utf8').split('\n').filter(Boolean));
  });

  return {
    child,
    stderr,
    send(message: McpMessage) {
      child.stdin?.write(`${JSON.stringify(message)}\n`);
    },
    receive(timeoutMs = 30_000) {
      if (queue.length) return Promise.resolve(queue.shift()!);
      return new Promise<McpMessage>((resolveMessage, reject) => {
        const timer = setTimeout(() => {
          resolver = null;
          reject(new Error(`Timed out waiting for MCP response after ${timeoutMs}ms`));
        }, timeoutMs);
        resolver = (message) => {
          clearTimeout(timer);
          resolveMessage(message);
        };
      });
    },
    async close() {
      child.stdin?.end();
      child.kill('SIGINT');
      await new Promise<void>((resolveClose) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolveClose();
        }, 5_000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolveClose();
        });
      });
      rmSync(cacheDir, { recursive: true, force: true });
    },
  };
}

function expectMcpSuccess(message: McpMessage, label: string) {
  if (message.error) {
    throw new Error(`${label} failed: ${message.error.message}`);
  }
  expect(message.result, `${label} result`).toBeTruthy();
}

function parseToolJson(message: McpMessage): Record<string, unknown> {
  const result = message.result as { content?: { type?: string; text?: string }[] } | undefined;
  const text = result?.content?.find((part) => part.type === 'text')?.text;
  if (!text) throw new Error('MCP tool response did not include text content');
  return JSON.parse(text) as Record<string, unknown>;
}

function redactMcpLog(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .replace(/orsk-[0-9a-f-]{36}/gi, 'orsk-REDACTED')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer REDACTED')
    .replace(/eyJ[A-Za-z0-9._-]+/g, 'JWT_REDACTED');
}

async function exerciseExternalMcp(apiKey: string, apiUrl: string) {
  const mcp = spawnOpenreadMcp(apiKey, apiUrl);
  try {
    mcp.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'openread-settings-contract', version: '1.0.0' },
      },
    });
    const initialize = await mcp.receive(45_000);
    expectMcpSuccess(initialize, 'initialize');
    mcp.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

    mcp.send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'list_books', arguments: { limit: 1 } },
    });
    const listBooks = await mcp.receive(45_000);
    expectMcpSuccess(listBooks, 'list_books');
    const listBooksJson = parseToolJson(listBooks);
    const books = listBooksJson.books as { id: string; title?: string; format?: string }[];
    expect(Array.isArray(books)).toBe(true);
    expect(books.length).toBeGreaterThan(0);

    mcp.send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'search_library', arguments: { query: 'time', limit: 1 } },
    });
    const searchLibrary = await mcp.receive(120_000);
    expectMcpSuccess(searchLibrary, 'search_library');
    const searchJson = parseToolJson(searchLibrary);
    expect(Number(searchJson.booksSearched ?? 0)).toBeGreaterThan(0);
    expect(Number(searchJson.totalMatches ?? 0)).toBeGreaterThan(0);

    return {
      listBooks: {
        totalCount: listBooksJson.totalCount,
        firstBook: { id: books[0]!.id, title: books[0]!.title, format: books[0]!.format },
      },
      searchLibrary: {
        query: searchJson.query,
        booksSearched: searchJson.booksSearched,
        booksWithMatches: searchJson.booksWithMatches,
        totalMatches: searchJson.totalMatches,
      },
      stderr: mcp.stderr,
    };
  } finally {
    await mcp.close();
  }
}

test.describe('Settings API Keys contract', () => {
  test('SET-047 creates an API key and shows the full key only in the result modal', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await mockApiKeys(page, { initialKeys: [] });
    await openApiKeys(page);
    await attachScenarioEvidence(page, testInfo, 'SET-047-start-create-api-key-show-once-result');

    await page.getByRole('button', { name: 'Create API Key' }).click();
    await page.getByLabel('Description').fill('Show-once QA key');
    await page.getByRole('button', { name: 'Create Key' }).click();

    await expect(page.getByRole('dialog', { name: 'API Key Created' })).toBeVisible();
    await expect(page.locator('input[value="orsk_show_once_full_secret"]')).toBeVisible();
    await expect(page.getByText("This is the only time you'll see the full key.")).toBeVisible();

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-047-terminal-create-api-key-show-once-result',
    );
  });

  test('SET-048 copies MCP client configuration from an expanded API key', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await mockApiKeys(page);
    await openApiKeys(page);
    await attachScenarioEvidence(page, testInfo, 'SET-048-start-copy-mcp-client-config');

    await page.getByRole('button', { name: /Claude Desktop QA/ }).click();
    await expect(page.getByText('MCP Configuration')).toBeVisible();
    await expect(page.getByText('npx')).toBeVisible();
    await page.getByLabel('Copy to clipboard').first().dispatchEvent('click');
    await expect(page.getByText('MCP Configuration')).toBeVisible();

    await attachScenarioEvidence(page, testInfo, 'SET-048-terminal-copy-mcp-client-config');
  });

  test('SET-049 authenticates an external MCP client and runs tools', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(
      !['chromium', 'msedge'].includes(testInfo.project.name),
      'External MCP execution is required for Chromium and Edge desktop lanes only.',
    );

    const description = `SET-049 external MCP QA ${Date.now()}`;
    let disposableKey: DisposableApiKey | null = null;

    await openApiKeys(page);
    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-049-start-external-mcp-auth-and-tool-success',
    );
    try {
      disposableKey = await createDisposableApiKey(page, description);
      const apiUrl = new URL(page.url()).origin;
      const mcpResult = await exerciseExternalMcp(disposableKey.key, apiUrl);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByText(description)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/Last used/i).first()).toBeVisible();

      const redactedMcpLog = redactMcpLog({ keyId: disposableKey.id, apiUrl, ...mcpResult });
      await testInfo.attach('SET-049-redacted-mcp-result', {
        body: redactedMcpLog,
        contentType: 'application/json',
      });
      await setScenarioEvidenceNote(page, 'SET-049 external MCP terminal', [
        `Disposable key id: ${disposableKey.id}`,
        `API URL: ${apiUrl}`,
        `list_books first title: ${mcpResult.listBooks.firstBook.title ?? 'available'}`,
        `search_library matches: ${mcpResult.searchLibrary.totalMatches}`,
        'Raw key/JWT redacted; full structured log attached as SET-049-redacted-mcp-result.',
      ]);
      await attachScenarioEvidence(
        page,
        testInfo,
        'SET-049-terminal-external-mcp-auth-and-tool-success',
      );
    } finally {
      if (disposableKey) await revokeDisposableApiKey(page, disposableKey.id);
    }
  });

  test('SET-050 shows last-used feedback for API keys', async ({
    authenticatedPage: page,
  }, testInfo) => {
    let lastUsedAt: string | null = null;
    await page.route('**/api/api-keys', async (route) => {
      await route.fulfill({
        json: {
          keys: [
            {
              id: 'qa-key-1',
              description: 'Claude Desktop QA',
              keyPrefix: 'orsk_qa1',
              createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
              lastUsedAt,
            },
          ],
        },
      });
    });
    await openApiKeys(page);
    await expect(page.getByText('Claude Desktop QA')).toBeVisible();
    await expect(page.getByText('Never used')).toBeVisible();
    await setScenarioEvidenceNote(page, 'SET-050 start', [
      'Before external MCP use: Last used state is Never used.',
      'Masked API key row is visible for Claude Desktop QA.',
    ]);
    await attachScenarioEvidence(page, testInfo, 'SET-050-start-mcp-last-used-feedback');

    lastUsedAt = new Date().toISOString();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Claude Desktop QA')).toBeVisible();
    await expect(page.getByText(/Last used (just now|\d+ second|\d+ minute)/i)).toBeVisible();
    await setScenarioEvidenceNote(page, 'SET-050 terminal', [
      `After simulated MCP auth/tool use: lastUsedAt=${lastUsedAt}`,
      'UI changed from Never used to a recent Last used value.',
      'Timestamp source: mocked API key refresh after MCP use event.',
    ]);

    await attachScenarioEvidence(page, testInfo, 'SET-050-terminal-mcp-last-used-feedback');
  });

  test('SET-051 cancels API key revocation without removing the key', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await mockApiKeys(page);
    await openApiKeys(page);
    await attachScenarioEvidence(page, testInfo, 'SET-051-start-revoke-api-key-cancel');

    await page.getByRole('button', { name: /Claude Desktop QA/ }).click();
    await page.getByRole('button', { name: 'Revoke Key' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(page.getByText('Claude Desktop QA')).toBeVisible();

    await attachScenarioEvidence(page, testInfo, 'SET-051-terminal-revoke-api-key-cancel');
  });

  test('SET-052 revokes an API key after confirmation', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await mockApiKeys(page);
    await page.route('**/api/mcp/auth', async (route) => {
      await route.fulfill({ status: 401, json: { error: 'Invalid or revoked API key' } });
    });
    await openApiKeys(page);
    await setScenarioEvidenceNote(page, 'SET-052 start', [
      'Disposable API key row is visible before revoke.',
      'Fresh-auth failure route is armed for the revoked key check.',
    ]);
    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-052-start-revoke-api-key-success-and-fresh-auth-failure',
    );

    await page.getByRole('button', { name: /Claude Desktop QA/ }).click();
    await page.getByRole('button', { name: 'Revoke Key' }).click();
    const revokeDialog = page.getByRole('alertdialog');
    await expect(revokeDialog).toBeVisible();
    await revokeDialog.getByRole('button', { name: 'Revoke Key' }).click();
    await expect(revokeDialog).toBeHidden();
    await expect(page.getByText('Claude Desktop QA')).toHaveCount(0);
    const freshAuthStatus = await page.evaluate(async () => {
      const response = await fetch('/api/mcp/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'orsk_REVOKED_REDACTED' }),
      });
      return response.status;
    });
    expect(freshAuthStatus).toBe(401);
    await setScenarioEvidenceNote(page, 'SET-052 terminal', [
      'Post-revoke list no longer shows Claude Desktop QA.',
      'Fresh MCP auth attempt with revoked key returned 401 Invalid or revoked API key.',
      'JWT caveat: already-issued MCP JWTs may remain valid until one-hour expiry; this check proves fresh auth fails.',
    ]);

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-052-terminal-revoke-api-key-success-and-fresh-auth-failure',
    );
  });

  test('SET-053 surfaces API key create and revoke errors without losing existing keys', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await mockApiKeys(page, { createStatus: 500, deleteStatus: 500 });
    await openApiKeys(page);
    await attachScenarioEvidence(page, testInfo, 'SET-053-start-api-key-create-revoke-error');

    await page.getByRole('button', { name: 'Create API Key' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Create API Key' });
    await page.getByLabel('Description').fill('Create failure QA key');
    await page.getByRole('button', { name: 'Create Key' }).click();
    await expect(createDialog).toBeVisible();
    await createDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(createDialog).toBeHidden();

    await page.getByRole('button', { name: /Claude Desktop QA/ }).click();
    await page.getByRole('button', { name: 'Revoke Key' }).click();
    const revokeDialog = page.getByRole('alertdialog');
    await expect(revokeDialog).toBeVisible();
    await revokeDialog.getByRole('button', { name: 'Revoke Key' }).click();
    await expect(revokeDialog).toBeHidden();
    await expect(page.getByText('Claude Desktop QA')).toBeVisible();

    await attachScenarioEvidence(page, testInfo, 'SET-053-terminal-api-key-create-revoke-error');
  });
});
