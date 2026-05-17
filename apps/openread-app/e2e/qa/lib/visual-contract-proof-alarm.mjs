import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const EXTERNAL_PROOF_KEYWORDS = [
  'endpoint',
  'directly probed',
  'direct probe',
  'direct request',
  'request returns',
  'mcp',
  'download',
  'export',
  'checkout',
  'portal',
  'webhook',
  'external handoff',
  'artifact',
];

const PROOF_MARKER_PATTERN =
  /\b(?:GET|POST|PUT|PATCH|DELETE|HTTP|status|request|response|returns?|returned|probe(?:d)?|artifact|downloaded|exported|STORAGE_ADDONS_DISABLED|\d{3})\b|=>/i;

const TRANSITION_KEYWORDS =
  /\b(?:persist|persistence|reload|reopen|toggle|cancel|confirm|delete|save|remove|reset|clear|download|export|checkout|portal|handoff|dialog|switch|open|close|sync now|reader settings)\b/i;

const LOADING_SLOT_PATTERN = /\b(?:skeleton|spinner|placeholder|loading|blank|404)\b/i;

export function evaluateQaVisualContractProofCell({
  scenario,
  platform,
  matchedEvidence,
  slotAudit,
}) {
  const alarms = [];
  const warnings = [];
  const expectedText = contractText(scenario);
  const proofText = evidenceProofText({ matchedEvidence, slotAudit });
  const terminalEvidence = terminalSlotEvidence(slotAudit);

  if (requiresExternalProof(expectedText) && !hasExternalProof(proofText, matchedEvidence)) {
    alarms.push(
      alarm({
        code: 'ui-only-external-proof',
        message:
          'Expected mentions an external/direct/artifact assertion, but the collected evidence has no explicit redacted request/log/artifact proof marker.',
        requestedFix:
          'Attach or surface proof for the external assertion, e.g. request method/path/status/body marker or exported/downloaded artifact evidence, in addition to UI screenshots.',
        platform,
      }),
    );
  }

  const loadingTerminal = terminalEvidence.find((item) =>
    LOADING_SLOT_PATTERN.test(`${item.slotName ?? ''} ${item.screenshotName ?? ''}`),
  );
  if (loadingTerminal && !/\bloading\b/i.test(expectedText)) {
    alarms.push(
      alarm({
        code: 'loading-terminal-evidence',
        message: `Terminal evidence appears to be a loading/placeholder slot: ${loadingTerminal.slotName ?? loadingTerminal.screenshotName}.`,
        requestedFix:
          'Recapture terminal evidence after the UI resolves to the expected final state, not while skeletons/spinners/placeholders are visible.',
        platform,
      }),
    );
  }

  const duplicateWithinCell = duplicateStartTerminalHashes(slotAudit);
  if (duplicateWithinCell.length && TRANSITION_KEYWORDS.test(expectedText)) {
    warnings.push(
      warning({
        code: 'identical-transition-evidence',
        message: `Start and terminal screenshot evidence are byte-identical for a contract that appears to require a transition: ${duplicateWithinCell.join(', ')}.`,
        requestedFix:
          'Consider distinct before/action/after evidence on the next recapture, or explain in Current why an invariant screenshot is valid for this contract.',
        platform,
      }),
    );
  }

  return {
    ok: alarms.length === 0,
    alarms,
    warnings,
  };
}

export function applyCrossScenarioVisualProofAlarms(matrix) {
  const terminalEvidenceByPlatformHash = new Map();

  for (const scenario of matrix ?? []) {
    for (const cell of scenario.platforms ?? []) {
      if (cell.requirement !== 'Required') continue;
      for (const item of terminalSlotEvidence(cell.slotAudit)) {
        const hash = screenshotHash(item.screenshotPath);
        if (!hash) continue;
        const key = `${cell.qaPlatformId ?? cell.id}::${hash}`;
        const entries = terminalEvidenceByPlatformHash.get(key) ?? [];
        entries.push({ scenario, cell, item });
        terminalEvidenceByPlatformHash.set(key, entries);
      }
    }
  }

  for (const entries of terminalEvidenceByPlatformHash.values()) {
    const scenarioIds = [...new Set(entries.map(({ scenario }) => scenario.scenarioId))];
    if (scenarioIds.length < 2) continue;
    for (const { scenario, cell, item } of entries) {
      addVisualProofWarning(
        cell,
        warning({
          code: 'reused-terminal-evidence',
          message: `Terminal screenshot ${item.slotName ?? item.screenshotName ?? 'unknown'} is byte-identical to terminal evidence for other contracts on the same platform: ${scenarioIds
            .filter((id) => id !== scenario.scenarioId)
            .join(', ')}.`,
          requestedFix:
            'Consider contract-specific terminal evidence on the next recapture, or document why the invariant screenshot proves this exact contract.',
          platform: cell,
        }),
      );
    }
  }

  return matrix;
}

export function addVisualProofAlarm(cell, nextAlarm) {
  const visualProof = normalizeVisualProof(cell.visualProof);
  if (
    visualProof.alarms.some(
      (item) => item.code === nextAlarm.code && item.message === nextAlarm.message,
    )
  ) {
    return cell;
  }
  visualProof.alarms.push(nextAlarm);
  visualProof.ok = visualProof.alarms.length === 0;
  cell.visualProof = visualProof;
  if (cell.requirement === 'Required' && cell.closureStatus === 'closed') {
    cell.verdict = 'visual-proof-alarm';
    cell.closureStatus = 'open';
  }
  return cell;
}

export function addVisualProofWarning(cell, nextWarning) {
  const visualProof = normalizeVisualProof(cell.visualProof);
  if (
    visualProof.warnings.some(
      (item) => item.code === nextWarning.code && item.message === nextWarning.message,
    )
  ) {
    return cell;
  }
  visualProof.warnings.push(nextWarning);
  visualProof.ok = visualProof.alarms.length === 0;
  cell.visualProof = visualProof;
  return cell;
}

export function visualProofAlarmCounts(cells) {
  const explicitDenyCells = cells.filter((cell) => (cell.visualProof?.alarms?.length ?? 0) > 0);
  const advisoryCells = cells.filter((cell) => (cell.visualProof?.warnings?.length ?? 0) > 0);
  const explicitDenyFindings = explicitDenyCells.reduce(
    (count, cell) => count + (cell.visualProof?.alarms?.length ?? 0),
    0,
  );
  const advisoryFindings = advisoryCells.reduce(
    (count, cell) => count + (cell.visualProof?.warnings?.length ?? 0),
    0,
  );
  return {
    cells: explicitDenyCells.length,
    alarms: explicitDenyFindings,
    explicitDeny: {
      cells: explicitDenyCells.length,
      findings: explicitDenyFindings,
    },
    advisory: {
      cells: advisoryCells.length,
      findings: advisoryFindings,
    },
  };
}

function normalizeVisualProof(value) {
  return {
    ok: (value?.alarms?.length ?? 0) === 0,
    alarms: [...(value?.alarms ?? [])],
    warnings: [...(value?.warnings ?? [])],
  };
}

function alarm({ code, message, requestedFix, platform }) {
  return visualProofFinding({ code, severity: 'explicit-deny', message, requestedFix, platform });
}

function warning({ code, message, requestedFix, platform }) {
  return visualProofFinding({ code, severity: 'advisory', message, requestedFix, platform });
}

function visualProofFinding({ code, severity, message, requestedFix, platform }) {
  return {
    code,
    severity,
    platformId: platform?.qaPlatformId ?? platform?.id ?? null,
    message,
    requestedFix,
  };
}

function contractText(scenario) {
  return [
    scenario?.scenarioId,
    scenario?.title,
    scenario?.scenarioOverview,
    scenario?.preconditions,
    scenario?.startState,
    scenario?.transientStates,
    scenario?.terminalStates,
    scenario?.assertionsEvidence,
    ...(scenario?.assertionsEvidenceItems ?? []),
    scenario?.automationNotes,
    ...(scenario?.evidenceSlots ?? []),
  ]
    .filter(Boolean)
    .join('\n');
}

function evidenceProofText({ matchedEvidence, slotAudit }) {
  return [
    matchedEvidence?.current,
    matchedEvidence?.errorMessage,
    stringifyForProof(matchedEvidence?.details),
    stringifyForProof(matchedEvidence?.evidenceArtifacts),
    ...(slotAudit?.evidence ?? []).flatMap((item) => [
      item.slotName,
      item.screenshotName,
      item.evidenceMode,
      item.artifactText,
    ]),
  ]
    .filter(Boolean)
    .join('\n');
}

function requiresExternalProof(expectedText) {
  const lower = String(expectedText ?? '').toLowerCase();
  return EXTERNAL_PROOF_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function hasExternalProof(proofText, matchedEvidence) {
  if (PROOF_MARKER_PATTERN.test(String(proofText ?? ''))) return true;
  return (matchedEvidence?.evidenceArtifacts ?? []).some(
    (artifact) => artifact?.path || artifact?.body,
  );
}

function terminalSlotEvidence(slotAudit) {
  return (slotAudit?.evidence ?? []).filter(
    (item) => slotType(item.slotName ?? item.screenshotName) === 'terminal',
  );
}

function duplicateStartTerminalHashes(slotAudit) {
  const starts = (slotAudit?.evidence ?? []).filter(
    (item) => slotType(item.slotName ?? item.screenshotName) === 'start',
  );
  const terminals = terminalSlotEvidence(slotAudit);
  const duplicates = [];
  for (const start of starts) {
    const startHash = screenshotHash(start.screenshotPath);
    if (!startHash) continue;
    for (const terminal of terminals) {
      const terminalHash = screenshotHash(terminal.screenshotPath);
      if (terminalHash && terminalHash === startHash) {
        duplicates.push(`${start.slotName ?? 'start'} == ${terminal.slotName ?? 'terminal'}`);
      }
    }
  }
  return duplicates;
}

function screenshotHash(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  try {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
  } catch {
    return null;
  }
}

function slotType(value) {
  const lower = String(value ?? '').toLowerCase();
  if (lower.includes('terminal')) return 'terminal';
  if (lower.includes('start')) return 'start';
  if (lower.includes('transient')) return 'transient';
  return 'other';
}

function stringifyForProof(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
