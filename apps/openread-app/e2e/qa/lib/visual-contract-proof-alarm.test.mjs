import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCrossScenarioVisualProofAlarms,
  evaluateQaVisualContractProofCell,
  visualProofAlarmCounts,
} from './visual-contract-proof-alarm.mjs';

function screenshot(dir, name, body) {
  const filePath = join(dir, `${name}.png`);
  writeFileSync(filePath, body);
  return filePath;
}

test('blocks external/direct contracts that only provide UI evidence', () => {
  const result = evaluateQaVisualContractProofCell({
    scenario: {
      scenarioId: 'SET-015',
      title: 'Storage tier-only no add-on checkout',
      assertionsEvidence:
        'No Add Storage UI, no add-on selector, checkout endpoint disabled when directly probed.',
      evidenceSlots: [
        'SET-015-start-storage-tier-only-no-add-on-checkout',
        'SET-015-terminal-storage-tier-only-no-add-on-checkout',
      ],
    },
    platform: { id: 'web-chromium' },
    matchedEvidence: {
      current: 'UI shows no Add Storage button.',
      evidenceArtifacts: [],
    },
    slotAudit: { evidence: [] },
  });

  assert.equal(result.ok, false);
  assert.equal(result.alarms[0].code, 'ui-only-external-proof');
  assert.equal(result.alarms[0].severity, 'explicit-deny');
});

test('accepts external/direct contracts with redacted request proof artifact text', () => {
  const result = evaluateQaVisualContractProofCell({
    scenario: {
      scenarioId: 'SET-017',
      title: 'Storage add-on cancel disabled',
      assertionsEvidence: 'No Cancel control, cancel endpoint disabled when directly probed.',
    },
    platform: { id: 'web-chromium' },
    matchedEvidence: {
      current: 'No active add-on rows are visible.',
      evidenceArtifacts: [
        {
          name: 'evidence:SET-017-api-storage-cancel-disabled',
          text: '{"method":"POST","path":"/api/stripe/cancel-storage-addon","status":410}',
        },
      ],
    },
    slotAudit: { evidence: [] },
  });

  assert.equal(result.ok, true);
});

test('does not block identical start and terminal screenshots by itself', () => {
  const dir = mkdtempSync(join(tmpdir(), 'openread-proof-alarm-'));
  const shared = screenshot(dir, 'shared-state', 'same image bytes');
  const result = evaluateQaVisualContractProofCell({
    scenario: {
      scenarioId: 'SET-014',
      title: 'Storage over-limit warning',
      assertionsEvidence: 'Warning persistence after quota resolves.',
      evidenceSlots: [
        'SET-014-start-storage-over-limit-warning',
        'SET-014-terminal-storage-over-limit-warning',
      ],
    },
    platform: { id: 'web-chromium' },
    matchedEvidence: {
      current: 'Warning state is visible.',
      evidenceArtifacts: [],
    },
    slotAudit: {
      evidence: [
        { slotName: 'SET-014-start-storage-over-limit-warning', screenshotPath: shared },
        { slotName: 'SET-014-terminal-storage-over-limit-warning', screenshotPath: shared },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.alarms.length, 0);
  assert.equal(result.warnings[0].code, 'identical-transition-evidence');
});

test('records advisory warnings when terminal screenshots are reused across different contracts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'openread-proof-alarm-'));
  const shared = screenshot(dir, 'shared-terminal', 'same image bytes');
  const matrix = [
    {
      scenarioId: 'SET-015',
      platforms: [
        {
          id: 'web-chromium',
          qaPlatformId: 'web-chromium',
          requirement: 'Required',
          verdict: 'matched',
          closureStatus: 'closed',
          slotAudit: {
            evidence: [
              {
                slotName: 'SET-015-terminal-storage-tier-only-no-add-on-checkout',
                screenshotPath: shared,
              },
            ],
          },
          visualProof: { ok: true, alarms: [] },
        },
      ],
    },
    {
      scenarioId: 'SET-017',
      platforms: [
        {
          id: 'web-chromium',
          qaPlatformId: 'web-chromium',
          requirement: 'Required',
          verdict: 'matched',
          closureStatus: 'closed',
          slotAudit: {
            evidence: [
              {
                slotName: 'SET-017-terminal-storage-add-on-cancel-disabled',
                screenshotPath: shared,
              },
            ],
          },
          visualProof: { ok: true, alarms: [] },
        },
      ],
    },
  ];

  applyCrossScenarioVisualProofAlarms(matrix);

  assert.equal(matrix[0].platforms[0].verdict, 'matched');
  assert.equal(matrix[1].platforms[0].verdict, 'matched');
  assert.equal(matrix[0].platforms[0].visualProof.ok, true);
  assert.equal(matrix[0].platforms[0].visualProof.alarms.length, 0);
  assert.equal(matrix[0].platforms[0].visualProof.warnings[0].code, 'reused-terminal-evidence');
  assert.equal(matrix[0].platforms[0].visualProof.warnings[0].severity, 'advisory');
});

test('summarizes explicit denies separately from advisory findings', () => {
  const counts = visualProofAlarmCounts([
    { visualProof: { alarms: [{ code: 'ui-only-external-proof' }], warnings: [] } },
    {
      visualProof: {
        alarms: [],
        warnings: [{ code: 'reused-terminal-evidence' }, { code: 'identical-transition-evidence' }],
      },
    },
  ]);

  assert.equal(counts.explicitDeny.cells, 1);
  assert.equal(counts.explicitDeny.findings, 1);
  assert.equal(counts.advisory.cells, 1);
  assert.equal(counts.advisory.findings, 2);
  assert.equal(counts.cells, counts.explicitDeny.cells);
  assert.equal(counts.alarms, counts.explicitDeny.findings);
});
