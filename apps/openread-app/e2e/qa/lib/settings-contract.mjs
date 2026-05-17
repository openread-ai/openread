import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  activityPaths,
  ensureDir,
  findFiles,
  readJsonIfExists,
  sanitizeName,
  timestampAttempt,
  writeJson,
} from './common.mjs';
import {
  contractIdsFromEvidenceValue,
  evidenceSlotName,
  parseQaContract,
  QA_CONTRACT_PATH,
} from './contracts.mjs';
import {
  applyCrossScenarioVisualProofAlarms,
  evaluateQaVisualContractProofCell,
  visualProofAlarmCounts,
} from './visual-contract-proof-alarm.mjs';

export const SETTINGS_CONTRACT_PATH = QA_CONTRACT_PATH;

export const SETTINGS_PLATFORM_ALIASES = Object.freeze({
  'web-edge-windows': 'web-edge',
});

export function buildSettingsContractCoverage({
  activityId,
  attemptId = `settings-contract-coverage-${timestampAttempt()}`,
  contractPath = SETTINGS_CONTRACT_PATH,
  platformRegistryPath = resolve(new URL('../registry/platforms.json', import.meta.url).pathname),
  strictEvidence = false,
  strictSlots = false,
} = {}) {
  if (!activityId) throw new Error('--activity is required');

  const scenarios = parseSettingsContract(contractPath);
  const platformRegistry = readJsonIfExists(platformRegistryPath) ?? { platforms: {} };
  const evidence = collectActivityScenarioEvidence(activityId);
  const matrix = applyCrossScenarioVisualProofAlarms(
    scenarios.map((scenario) =>
      buildScenarioRow({ scenario, evidence, platformRegistry, strictEvidence, strictSlots }),
    ),
  );
  const summary = summarizeMatrix(matrix);
  const result = summary.required.matched === summary.required.total ? 'passed' : 'incomplete';
  const paths = activityPaths(activityId, sanitizeName(attemptId));
  const artifactDir = resolve(paths.attemptDir, 'settings-contract-coverage');
  ensureDir(artifactDir);

  const report = {
    schemaVersion: 1,
    kind: 'settings-contract-coverage',
    result,
    activityId: paths.activityId,
    attemptId: paths.attemptId,
    contractPath,
    scenarioCount: scenarios.length,
    platforms: Array.from(
      new Set(scenarios.flatMap((scenario) => scenario.platforms.map((p) => p.id))),
    ),
    summary,
    strictEvidence,
    strictSlots,
    acceptedEvidenceModes: strictEvidence ? acceptedStrictEvidenceModes() : null,
    matrix,
    evidenceSources: evidence.sources,
    createdAt: new Date().toISOString(),
  };

  const jsonPath = resolve(artifactDir, 'settings-contract-coverage.json');
  const markdownPath = resolve(artifactDir, 'settings-contract-coverage.md');
  writeJson(jsonPath, report);
  writeFileSync(markdownPath, `${settingsContractCoverageMarkdown(report)}\n`);

  return { report, jsonPath, markdownPath, artifactDir };
}

export function parseSettingsContract(contractPath = SETTINGS_CONTRACT_PATH) {
  return parseQaContract({
    contractPath,
    idPrefixes: ['SET'],
    platformAliases: SETTINGS_PLATFORM_ALIASES,
  });
}

function collectActivityScenarioEvidence(activityId) {
  const paths = activityPaths(activityId);
  const reportPaths = findFiles(
    paths.activityDir,
    (name) => name === 'expected-current-report.json',
  );
  const byScenarioPlatform = new Map();
  const byScenarioPlatformSlots = new Map();
  const sources = [];

  for (const reportPath of reportPaths) {
    const report = readJsonIfExists(reportPath);
    if (!report?.scenarios?.length) continue;
    const platformId = report.platform?.id;
    if (!platformId) continue;

    sources.push({
      attemptId: report.attemptId,
      targetName: report.targetName,
      lane: report.lane,
      platformId,
      result: report.result,
      reportPath,
      createdAt: report.createdAt ?? null,
    });

    for (const scenario of report.scenarios) {
      const scenarioIds = scenarioIdsFromScenario(scenario);
      const baseItem = {
        platformId,
        attemptId: report.attemptId,
        targetName: report.targetName,
        lane: report.lane,
        reportPath,
        title: scenario.title,
        consistency: scenario.consistency,
        status: scenario.status,
        outcome: scenario.outcome,
        screenshotKind: scenario.screenshotKind,
        screenshotName: scenario.screenshotName,
        screenshotPath: scenario.screenshotPath ?? null,
        hasScenarioEvidence: scenario.screenshotKind === 'scenario-evidence',
        hasScreenshot: Boolean(scenario.screenshotPath),
        evidenceMode: scenario.evidenceMode ?? scenario.contract?.evidenceMode ?? null,
        current: scenario.current ?? null,
        details: scenario.details ?? null,
        errorMessage: scenario.errorMessage ?? null,
        evidenceArtifacts: evidenceArtifactsForScenario(scenario),
        createdAt: report.createdAt ?? null,
      };

      for (const scenarioId of scenarioIds) {
        const key = evidenceKey(scenarioId, platformId);
        const item = { ...baseItem, scenarioId };
        const existing = byScenarioPlatform.get(key);
        if (!existing || compareEvidence(item, existing) > 0) byScenarioPlatform.set(key, item);
      }

      for (const attachment of evidenceAttachmentsForScenario(scenario, baseItem)) {
        const slotName = evidenceSlotName(attachment.name);
        const slotScenarioIds = contractIdsFromEvidenceValue(slotName);
        for (const scenarioId of slotScenarioIds.length ? slotScenarioIds : scenarioIds) {
          appendSlotEvidence(byScenarioPlatformSlots, evidenceKey(scenarioId, platformId), {
            ...baseItem,
            scenarioId,
            screenshotName: attachment.name,
            screenshotPath: attachment.path,
          });
        }
      }
    }
  }

  return { byScenarioPlatform, byScenarioPlatformSlots, sources };
}

function scenarioIdsFromScenario(scenario) {
  const attachmentNames = Array.isArray(scenario.evidenceAttachments)
    ? scenario.evidenceAttachments.map((attachment) => attachment.name).join(' ')
    : '';
  return Array.from(
    new Set([
      ...contractIdsFromEvidenceValue(`${scenario.scenarioId ?? ''} ${scenario.title ?? ''}`),
      ...contractIdsFromEvidenceValue(scenario.screenshotName),
      ...contractIdsFromEvidenceValue(attachmentNames),
    ]),
  );
}

function evidenceAttachmentsForScenario(scenario, item) {
  if (Array.isArray(scenario.evidenceAttachments) && scenario.evidenceAttachments.length) {
    return scenario.evidenceAttachments;
  }
  return item.hasScenarioEvidence
    ? [
        {
          name: item.screenshotName,
          path: item.screenshotPath,
          contentType: 'image/png',
        },
      ]
    : [];
}

function evidenceArtifactsForScenario(scenario) {
  return (scenario.evidenceArtifacts ?? [])
    .filter((artifact) => artifact?.name || artifact?.path)
    .map((artifact) => ({
      name: artifact.name ?? null,
      path: artifact.path ?? null,
      contentType: artifact.contentType ?? null,
      text: artifact.path ? readArtifactText(artifact.path) : null,
    }));
}

function readArtifactText(path) {
  try {
    const value = readFileSync(path, 'utf8');
    return value.length > 50_000 ? `${value.slice(0, 50_000)}\n[truncated]` : value;
  } catch {
    return null;
  }
}

function appendSlotEvidence(byScenarioPlatformSlots, key, evidence) {
  const slots = byScenarioPlatformSlots.get(key) ?? [];
  slots.push({
    slotName: evidenceSlotName(evidence.screenshotName),
    attemptId: evidence.attemptId,
    targetName: evidence.targetName,
    lane: evidence.lane,
    status: evidence.status,
    consistency: evidence.consistency,
    evidenceMode: evidence.evidenceMode,
    screenshotName: evidence.screenshotName,
    screenshotPath: evidence.screenshotPath ?? null,
    artifactText: evidence.artifactText ?? null,
    createdAt: evidence.createdAt,
  });
  byScenarioPlatformSlots.set(key, slots);
}

function buildScenarioRow({ scenario, evidence, platformRegistry, strictEvidence, strictSlots }) {
  return {
    scenarioId: scenario.scenarioId,
    title: scenario.title,
    scope: scenario.scope,
    scenarioOverview: scenario.scenarioOverview,
    interactionCoverage: scenario.interactionCoverage,
    impactCoverage: scenario.impactCoverage,
    preconditions: scenario.preconditions,
    startState: scenario.startState,
    transientStates: scenario.transientStates,
    terminalStates: scenario.terminalStates,
    assertionsEvidence: scenario.assertionsEvidence,
    assertionsEvidenceItems: scenario.assertionsEvidenceItems,
    automationNotes: scenario.automationNotes,
    evidenceSlots: scenario.evidenceSlots,
    platforms: scenario.platforms.map((platform) => {
      const registryEntry = platformRegistry.platforms?.[platform.qaPlatformId] ?? null;
      const key = evidenceKey(scenario.scenarioId, platform.qaPlatformId);
      const matchedEvidence = evidence.byScenarioPlatform.get(key);
      const slotEvidence = evidence.byScenarioPlatformSlots.get(key) ?? [];
      return buildPlatformCell({
        scenario,
        platform,
        registryEntry,
        matchedEvidence,
        slotEvidence,
        strictEvidence,
        strictSlots,
      });
    }),
  };
}

function buildPlatformCell({
  scenario,
  platform,
  registryEntry,
  matchedEvidence,
  slotEvidence,
  strictEvidence,
  strictSlots,
}) {
  if (platform.requirement !== 'Required') {
    return {
      ...platform,
      verdict: 'not-required',
      closureStatus: 'not-required',
      evidence: null,
      slotAudit: skippedSlotAudit({ scenario, status: 'not-required' }),
    };
  }

  const slotAudit = buildSlotAudit({ scenario, slotEvidence });
  const visualProof = evaluateQaVisualContractProofCell({
    scenario,
    platform,
    matchedEvidence,
    slotAudit,
  });

  if (
    matchedEvidence?.consistency === 'matched' &&
    matchedEvidence.hasScenarioEvidence &&
    (!strictEvidence || isStrictEvidence(matchedEvidence))
  ) {
    const slotVerdict = strictSlots ? slotVerdictForAudit(slotAudit) : 'matched';
    const visualVerdict = visualProof.ok ? slotVerdict : 'visual-proof-alarm';
    return {
      ...platform,
      verdict: visualVerdict,
      closureStatus: visualVerdict === 'matched' ? 'closed' : 'open',
      evidence: publicEvidenceSummary(matchedEvidence),
      slotAudit,
      visualProof,
    };
  }

  if (matchedEvidence) {
    return {
      ...platform,
      verdict:
        strictEvidence && !isStrictEvidence(matchedEvidence)
          ? 'provisional-evidence'
          : matchedEvidence.hasScenarioEvidence
            ? 'mismatch'
            : 'evidence-gap',
      closureStatus: 'open',
      evidence: publicEvidenceSummary(matchedEvidence),
      slotAudit,
      visualProof,
    };
  }

  if (registryEntry?.enabled === false || registryEntry?.contractCoverageEnabled === false) {
    return {
      ...platform,
      verdict: 'blocked-adapter',
      closureStatus: 'blocked',
      evidence: null,
      blocker:
        registryEntry?.contractCoverageEnabled === false
          ? (registryEntry.status ?? 'contract coverage disabled for this adapter')
          : (registryEntry?.status ?? 'adapter disabled'),
      slotAudit: skippedSlotAudit({ scenario, status: 'blocked-adapter' }),
    };
  }

  return {
    ...platform,
    verdict: 'missing',
    closureStatus: 'open',
    evidence: null,
    slotAudit,
  };
}

function skippedSlotAudit({ scenario, status }) {
  const expectedSlots = scenario.evidenceSlots ?? [];
  return {
    status,
    expectedSlots,
    requiredSlots: [],
    optionalSlots: [],
    actualSlots: [],
    matchedRequiredSlots: [],
    missingRequiredSlots: [],
    missingStartSlots: [],
    missingTerminalSlots: [],
    unexpectedSlots: [],
    counts: {
      expected: expectedSlots.length,
      required: 0,
      optional: 0,
      actual: 0,
      matchedRequired: 0,
      missingRequired: 0,
      requiredStart: 0,
      missingStart: 0,
      requiredTerminal: 0,
      missingTerminal: 0,
      unexpected: 0,
    },
    evidence: [],
  };
}

function buildSlotAudit({ scenario, slotEvidence }) {
  const expectedSlots = scenario.evidenceSlots ?? [];
  const selectedSlotEvidence = selectBestSlotEvidence({ expectedSlots, slotEvidence });
  const requiredSlots = expectedSlots.filter((slot) => !isOptionalSlot(slot));
  const optionalSlots = expectedSlots.filter(isOptionalSlot);
  const actualSlots = Array.from(
    new Set(selectedSlotEvidence.map((item) => item.slotName).filter(Boolean)),
  );
  const matchedRequiredSlots = requiredSlots.filter((slot) => actualSlots.includes(slot));
  const missingRequiredSlots = requiredSlots.filter((slot) => !actualSlots.includes(slot));
  const requiredStartSlots = requiredSlots.filter((slot) => slotType(slot) === 'start');
  const requiredTerminalSlots = requiredSlots.filter((slot) => slotType(slot) === 'terminal');
  const missingStartSlots = missingRequiredSlots.filter((slot) => slotType(slot) === 'start');
  const missingTerminalSlots = missingRequiredSlots.filter((slot) => slotType(slot) === 'terminal');
  const unexpectedSlots = actualSlots.filter((slot) => !expectedSlots.includes(slot));
  const status = slotAuditStatus({
    requiredSlots,
    missingRequiredSlots,
    actualSlots,
    unexpectedSlots,
  });

  return {
    status,
    expectedSlots,
    requiredSlots,
    optionalSlots,
    actualSlots,
    matchedRequiredSlots,
    missingRequiredSlots,
    missingStartSlots,
    missingTerminalSlots,
    unexpectedSlots,
    counts: {
      expected: expectedSlots.length,
      required: requiredSlots.length,
      optional: optionalSlots.length,
      actual: actualSlots.length,
      matchedRequired: matchedRequiredSlots.length,
      missingRequired: missingRequiredSlots.length,
      requiredStart: requiredStartSlots.length,
      missingStart: missingStartSlots.length,
      requiredTerminal: requiredTerminalSlots.length,
      missingTerminal: missingTerminalSlots.length,
      unexpected: unexpectedSlots.length,
    },
    evidence: selectedSlotEvidence,
  };
}

function selectBestSlotEvidence({ expectedSlots, slotEvidence }) {
  if (slotEvidence.length <= 1) return slotEvidence;
  const requiredSlots = expectedSlots.filter((slot) => !isOptionalSlot(slot));
  const groups = new Map();

  for (const item of slotEvidence) {
    const key = [item.attemptId, item.targetName, item.lane].filter(Boolean).join('::');
    const groupKey = key || 'unknown';
    const group = groups.get(groupKey) ?? [];
    group.push(item);
    groups.set(groupKey, group);
  }

  return Array.from(groups.values()).sort((left, right) =>
    compareSlotEvidenceGroups({ left, right, expectedSlots, requiredSlots }),
  )[0];
}

function compareSlotEvidenceGroups({ left, right, expectedSlots, requiredSlots }) {
  const leftScore = slotEvidenceGroupScore({ group: left, expectedSlots, requiredSlots });
  const rightScore = slotEvidenceGroupScore({ group: right, expectedSlots, requiredSlots });
  return (
    leftScore.missingRequired - rightScore.missingRequired ||
    leftScore.unexpected - rightScore.unexpected ||
    rightScore.matchedRequired - leftScore.matchedRequired ||
    rightScore.timestamp - leftScore.timestamp
  );
}

function slotEvidenceGroupScore({ group, expectedSlots, requiredSlots }) {
  const actualSlots = Array.from(new Set(group.map((item) => item.slotName).filter(Boolean)));
  return {
    matchedRequired: requiredSlots.filter((slot) => actualSlots.includes(slot)).length,
    missingRequired: requiredSlots.filter((slot) => !actualSlots.includes(slot)).length,
    unexpected: actualSlots.filter((slot) => !expectedSlots.includes(slot)).length,
    timestamp: Math.max(...group.map(evidenceTimestamp), 0),
  };
}

function isOptionalSlot(slot) {
  return /optional|if observable/i.test(String(slot ?? ''));
}

function slotType(slot) {
  const value = String(slot ?? '').toLowerCase();
  if (value.includes('start')) return 'start';
  if (value.includes('terminal')) return 'terminal';
  if (value.includes('transient')) return 'transient';
  return 'other';
}

function slotAuditStatus({ requiredSlots, missingRequiredSlots, actualSlots, unexpectedSlots }) {
  if (!requiredSlots.length) return 'not-specified';
  if (!actualSlots.length) return 'missing';
  if (!missingRequiredSlots.length)
    return unexpectedSlots.length ? 'matched-with-extra' : 'matched';
  return unexpectedSlots.length ? 'name-mismatch' : 'missing-slots';
}

function slotVerdictForAudit(slotAudit) {
  if (['matched', 'matched-with-extra', 'not-specified'].includes(slotAudit.status))
    return 'matched';
  if (slotAudit.missingTerminalSlots.length) return 'slot-terminal-gap';
  if (slotAudit.missingStartSlots.length) return 'slot-start-gap';
  if (slotAudit.unexpectedSlots.length) return 'slot-name-mismatch';
  return 'slot-gap';
}

function acceptedStrictEvidenceModes() {
  return ['real-ui', 'qa-seam-real-ui', 'controller-real-ui'];
}

function isStrictEvidence(evidence) {
  if (acceptedStrictEvidenceModes().includes(evidence.evidenceMode)) return true;
  if (evidence.evidenceMode) return false;
  return evidence.platformId?.startsWith('web-') || evidence.platformId?.startsWith('mobile-web-');
}

function publicEvidenceSummary(evidence) {
  return {
    attemptId: evidence.attemptId,
    targetName: evidence.targetName,
    lane: evidence.lane,
    consistency: evidence.consistency,
    status: evidence.status,
    outcome: evidence.outcome,
    screenshotKind: evidence.screenshotKind,
    screenshotName: evidence.screenshotName,
    hasScenarioEvidence: evidence.hasScenarioEvidence,
    hasScreenshot: evidence.hasScreenshot,
    evidenceMode: evidence.evidenceMode,
    current: evidence.current,
    details: evidence.details,
    errorMessage: evidence.errorMessage,
    evidenceArtifacts: evidence.evidenceArtifacts,
  };
}

function summarizeMatrix(matrix) {
  const cells = matrix.flatMap((scenario) => scenario.platforms);
  const requiredCells = cells.filter((cell) => cell.requirement === 'Required');
  const notRequiredCells = cells.filter((cell) => cell.requirement !== 'Required');
  const verdicts = countBy(cells, (cell) => cell.verdict);
  const requiredVerdicts = countBy(requiredCells, (cell) => cell.verdict);
  const visualProof = visualProofAlarmCounts(requiredCells);
  const slotStatus = countBy(requiredCells, (cell) => cell.slotAudit?.status ?? 'not-audited');
  const slotCounts = requiredCells.reduce(
    (counts, cell) => {
      const audit = cell.slotAudit;
      if (!audit) return counts;
      counts.expected += audit.counts.expected;
      counts.required += audit.counts.required;
      counts.actual += audit.counts.actual;
      counts.matchedRequired += audit.counts.matchedRequired;
      counts.missingRequired += audit.counts.missingRequired;
      counts.missingStart += audit.counts.missingStart;
      counts.missingTerminal += audit.counts.missingTerminal;
      counts.unexpected += audit.counts.unexpected;
      return counts;
    },
    {
      expected: 0,
      required: 0,
      actual: 0,
      matchedRequired: 0,
      missingRequired: 0,
      missingStart: 0,
      missingTerminal: 0,
      unexpected: 0,
    },
  );

  return {
    scenarios: matrix.length,
    totalCells: cells.length,
    required: {
      total: requiredCells.length,
      matched: requiredVerdicts.matched ?? 0,
      missing: requiredVerdicts.missing ?? 0,
      evidenceGaps: requiredVerdicts['evidence-gap'] ?? 0,
      mismatches: requiredVerdicts.mismatch ?? 0,
      provisionalEvidence: requiredVerdicts['provisional-evidence'] ?? 0,
      blockedAdapters: requiredVerdicts['blocked-adapter'] ?? 0,
      visualProofAlarms: requiredVerdicts['visual-proof-alarm'] ?? 0,
      open: requiredCells.length - (requiredVerdicts.matched ?? 0),
      visualProof,
      slotEvidence: {
        statuses: slotStatus,
        counts: slotCounts,
        cellsWithMissingSlots: requiredCells.filter(
          (cell) => (cell.slotAudit?.counts.missingRequired ?? 0) > 0,
        ).length,
        cellsWithMissingStart: requiredCells.filter(
          (cell) => (cell.slotAudit?.counts.missingStart ?? 0) > 0,
        ).length,
        cellsWithMissingTerminal: requiredCells.filter(
          (cell) => (cell.slotAudit?.counts.missingTerminal ?? 0) > 0,
        ).length,
        cellsWithUnexpectedSlots: requiredCells.filter(
          (cell) => (cell.slotAudit?.counts.unexpected ?? 0) > 0,
        ).length,
      },
    },
    notRequired: notRequiredCells.length,
    verdicts,
  };
}

function settingsContractCoverageMarkdown(report) {
  const lines = [
    `# Settings contract coverage — ${report.activityId}`,
    '',
    `- Result: ${report.result}`,
    `- Scenarios: ${report.summary.scenarios}`,
    `- Required cells: ${report.summary.required.total}`,
    `- Matched required cells: ${report.summary.required.matched}`,
    `- Open required cells: ${report.summary.required.open}`,
    `- Missing required cells: ${report.summary.required.missing}`,
    `- Evidence-gap required cells: ${report.summary.required.evidenceGaps}`,
    `- Mismatch required cells: ${report.summary.required.mismatches}`,
    `- Provisional-evidence required cells: ${report.summary.required.provisionalEvidence}`,
    `- Blocked native/Tauri adapter cells: ${report.summary.required.blockedAdapters}`,
    `- Visual proof explicit-deny cells: ${report.summary.required.visualProof.explicitDeny.cells}`,
    `- Visual proof explicit-deny findings: ${report.summary.required.visualProof.explicitDeny.findings}`,
    `- Visual proof advisory cells: ${report.summary.required.visualProof.advisory.cells}`,
    `- Visual proof advisory findings: ${report.summary.required.visualProof.advisory.findings}`,
    '- Visual proof policy: explicit deny blocks; advisory proceeds unless it overlaps an open required slot, becomes explicit-deny, or a reviewer challenges it.',
    `- Slot evidence required slots: ${report.summary.required.slotEvidence.counts.required}`,
    `- Slot evidence matched required slots: ${report.summary.required.slotEvidence.counts.matchedRequired}`,
    `- Slot evidence missing required slots: ${report.summary.required.slotEvidence.counts.missingRequired}`,
    `- Cells with missing start slots: ${report.summary.required.slotEvidence.cellsWithMissingStart}`,
    `- Cells with missing terminal slots: ${report.summary.required.slotEvidence.cellsWithMissingTerminal}`,
    '',
    `- Strict evidence: ${report.strictEvidence ? 'enabled' : 'disabled'}`,
    `- Strict slots: ${report.strictSlots ? 'enabled' : 'disabled'}`,
    '',
    'Legend: `matched` = closed with accepted scenario evidence; `visual-proof-alarm` = explicit-deny visual/API/artifact proof finding fired; visual proof advisories are reviewer guidance and do not reopen matched cells; `missing` = no mapped evidence; `evidence-gap` = assertion result exists without scenario evidence; `provisional-evidence` = scenario evidence exists but strict mode rejects its evidence mode; `slot-start-gap` / `slot-terminal-gap` / `slot-name-mismatch` = strict slot audit found missing or mismatched contract screenshot slots; `blocked-adapter` = required platform adapter is disabled/pending; `not-required` = contract says the platform is not required.',
    '',
    matrixMarkdown(report.matrix),
    '',
    '## Evidence sources',
    '',
    ...evidenceSourcesMarkdown(report.evidenceSources),
  ];
  return lines.join('\n');
}

function matrixMarkdown(matrix) {
  const platforms = Array.from(
    new Set(matrix.flatMap((scenario) => scenario.platforms.map((p) => p.id))),
  );
  const lines = [
    `| Scenario | Title | ${platforms.join(' | ')} |`,
    `| --- | --- | ${platforms.map(() => '---').join(' | ')} |`,
  ];

  for (const scenario of matrix) {
    const cellsById = new Map(scenario.platforms.map((cell) => [cell.id, cell]));
    const verdicts = platforms.map((platformId) => cellMarkdown(cellsById.get(platformId)));
    lines.push(
      `| ${scenario.scenarioId} | ${escapeCell(scenario.title)} | ${verdicts.join(' | ')} |`,
    );
  }

  return lines.join('\n');
}

function cellMarkdown(cell) {
  if (!cell) return 'n/a';
  if (!cell.slotAudit || cell.requirement !== 'Required') return cell.verdict;
  const suffixes = [];
  const missing = cell.slotAudit.counts.missingRequired;
  if (missing) suffixes.push(`slots:${cell.slotAudit.status}/${missing}`);
  const visualAlarms = cell.visualProof?.alarms?.length ?? 0;
  if (visualAlarms) suffixes.push(`visual-proof-deny:${visualAlarms}`);
  const visualWarnings = cell.visualProof?.warnings?.length ?? 0;
  if (visualWarnings) suffixes.push(`visual-proof-advice:${visualWarnings}`);
  return suffixes.length ? `${cell.verdict} (${suffixes.join(',')})` : cell.verdict;
}

function evidenceSourcesMarkdown(sources) {
  if (!sources.length) return ['No expected/current reports found for this activity.'];
  return sources
    .sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))
    .map(
      (source) =>
        `- ${source.platformId} / ${source.targetName} / ${source.attemptId}: ${source.result}`,
    );
}

function evidenceKey(scenarioId, platformId) {
  return `${scenarioId}::${platformId}`;
}

function compareEvidence(a, b) {
  const rankDelta = evidenceRank(a) - evidenceRank(b);
  if (rankDelta !== 0) return rankDelta;
  return evidenceTimestamp(a) - evidenceTimestamp(b);
}

function evidenceRank(evidence) {
  let rank = 0;
  if (acceptedStrictEvidenceModes().includes(evidence.evidenceMode)) rank += 16;
  if (evidence.hasScreenshot) rank += 1;
  if (evidence.hasScenarioEvidence) rank += 4;
  if (evidence.consistency === 'matched') rank += 8;
  if (evidence.status === 'passed') rank += 2;
  return rank;
}

function evidenceTimestamp(evidence) {
  const timestamp = Date.parse(evidence.createdAt ?? '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function countBy(items, keyFn) {
  return items.reduce((counts, item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}
