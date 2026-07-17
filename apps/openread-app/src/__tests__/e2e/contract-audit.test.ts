import { EventEmitter } from 'node:events';
import type { ConsoleMessage, Page, Request, Response } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import {
  assertContractAudit,
  buildContractAuditArtifact,
  hashContractEvidence,
  startContractAudit,
} from '../../../e2e/helpers/contract-audit';

class FakePage extends EventEmitter {}

function request(url: string, method = 'GET', resourceType = 'fetch') {
  return {
    url: () => url,
    method: () => method,
    resourceType: () => resourceType,
    failure: () => null,
  } as unknown as Request;
}

describe('contract audit', () => {
  it('records bounded canonical evidence without query, body, or path identifiers', () => {
    const page = new FakePage();
    const audit = startContractAudit(page as unknown as Page);
    const target = request(
      'https://api.openread.ai/api/catalog/books/11111111-1111-4111-8111-111111111111?token=secret',
    );

    page.emit('request', target);
    page.emit('response', {
      request: () => target,
      status: () => 200,
    } as unknown as Response);
    page.emit('console', {
      type: () => 'warning',
      text: () => 'secret warning payload',
    } as unknown as ConsoleMessage);
    page.emit('pageerror', Object.assign(new Error('secret page failure'), { name: 'TypeError' }));

    audit.stop();
    const snapshot = audit.snapshot();
    const fixtureEmail = 'private-account@example.com';
    const sentinelTitle = 'Private Sentinel Title';
    const serialized = JSON.stringify(
      buildContractAuditArtifact(audit, {
        account: {
          fixtureEmailSha256: hashContractEvidence(fixtureEmail),
          sentinelTitleSha256: hashContractEvidence(sentinelTitle),
        },
      }),
    );

    expect(snapshot.network).toEqual([
      expect.objectContaining({
        method: 'GET',
        host: 'api.openread.ai',
        effect: 'read',
        status: 200,
        outcome: 'response',
      }),
    ]);
    expect(snapshot.network[0].pathSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.pageErrors[0]).toEqual(
      expect.objectContaining({ name: 'TypeError', type: 'page-error' }),
    );
    expect(() => assertContractAudit(audit)).not.toThrow();
    expect(() => assertContractAudit(audit, { runtimeErrors: true })).toThrow(
      'RUNTIME_ERROR_EVENTS_DETECTED:1',
    );
    expect(serialized).not.toContain('11111111');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain(fixtureEmail);
    expect(serialized).not.toContain(sentinelTitle);
    expect(serialized).not.toContain('https://');
    expect(serialized).not.toContain('?');
  });

  it('excludes auth traffic but rejects product mutation methods', () => {
    const page = new FakePage();
    const audit = startContractAudit(page as unknown as Page);

    page.emit(
      'request',
      request('https://project.supabase.co/auth/v1/token?grant_type=refresh_token', 'POST'),
    );
    expect(() => audit.assertNoProductMutations()).not.toThrow();

    page.emit('request', request('https://app.openread.ai/api/sync/pull', 'POST'));
    expect(audit.snapshot().network.at(-1)).toEqual(
      expect.objectContaining({ category: 'product', effect: 'read' }),
    );
    expect(() => audit.assertNoProductMutations()).not.toThrow();

    page.emit('request', request('https://app.openread.ai/api/sync/push', 'POST'));
    expect(() => assertContractAudit(audit)).toThrow('PRODUCT_MUTATION_REQUESTS_DETECTED:1');
  });

  it('fails closed when the bounded ledger drops events', () => {
    const page = new FakePage();
    const audit = startContractAudit(page as unknown as Page, { maxNetworkEvents: 1 });

    page.emit('request', request('https://app.openread.ai/api/books'));
    page.emit('request', request('https://app.openread.ai/api/catalog'));

    expect(audit.snapshot().dropped.network).toBe(1);
    expect(() => assertContractAudit(audit)).toThrow('CONTRACT_AUDIT_EVENTS_DROPPED:1');
  });

  it('stops listeners deterministically', () => {
    const page = new FakePage();
    const audit = startContractAudit(page as unknown as Page);
    audit.stop();
    audit.stop();

    page.emit('request', request('https://app.openread.ai/api/books'));
    expect(audit.snapshot().network).toEqual([]);
    expect(page.listenerCount('request')).toBe(0);
  });
});
