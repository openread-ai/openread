import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureDir, readJsonIfExists, writeJson } from './common.mjs';
import { contractIdsFromEvidenceValue, parseQaContract } from './contracts.mjs';

export function buildExpectedCurrentReport({ laneResult, target }) {
  const playwrightResults = readJsonIfExists(laneResult.playwrightResultsPath);
  const tests = collectSpecs(playwrightResults?.suites ?? []);
  const expectedOutcomes = normalizeExpectedOutcomes(target.expectedOutcomes);
  const targetDefaultExpected =
    target.defaultExpectedOutcome ??
    'Behavior should match the documented current-state QA baseline.';
  const qaContract = qaContractMap(target);

  const scenarios = tests
    .map((test) => {
      const expected = expectedOutcomes.get(test.title) ?? expectedOutcomes.get(test.titlePath);
      const inferredScenarioId = inferScenarioId(
        `${test.screenshotName ?? ''} ${test.title ?? ''} ${test.titlePath ?? ''}`,
      );
      const contractScenarios = contractScenariosForValue(inferredScenarioId, qaContract);
      const currentStatus = test.status === 'passed' ? 'passed' : test.status || test.outcome;
      const hasScenarioEvidence = test.screenshotKind === 'scenario-evidence';
      const evidenceGap =
        (test.status === 'passed' || test.outcome === 'flaky') && !hasScenarioEvidence;
      const evidenceSummary = hasScenarioEvidence
        ? 'Scenario evidence screenshot attached.'
        : evidenceGap
          ? 'Evidence gap: no scenario evidence screenshot attached.'
          : test.screenshotPath
            ? 'Debug/final screenshot captured.'
            : 'No screenshot captured.';
      const current =
        expected?.current && !contractScenarios.length
          ? expected.current
          : defaultCurrentForTest({
              test,
              currentStatus,
              evidenceSummary,
              contractScenarios,
              platform: laneResult.platform,
            });
      const consistency =
        expected?.consistency ??
        (evidenceGap
          ? 'evidence-gap'
          : test.outcome === 'flaky'
            ? 'flaky-on-retry'
            : test.status === 'passed'
              ? 'matched'
              : 'mismatch');

      return {
        title: test.title,
        titlePath: test.titlePath,
        file: test.file,
        line: test.line,
        project: test.projectName,
        scenarioId: expected?.scenarioId ?? expected?.id ?? inferredScenarioId,
        description: expected?.description ?? descriptionForScenarios({ contractScenarios, test }),
        expected: contractScenarios.length
          ? expectedForScenarios(contractScenarios)
          : (expected?.expected ??
            defaultExpectedForTest({ test, target, targetDefaultExpected, contractScenarios })),
        current,
        consistency,
        status: test.status,
        outcome: test.outcome,
        statuses: test.statuses,
        durationMs: test.durationMs,
        screenshotPath: test.screenshotPath ?? null,
        screenshotName: test.screenshotName ?? null,
        screenshotKind: test.screenshotKind ?? null,
        evidenceAttachments: test.evidenceAttachments ?? [],
        evidenceArtifacts: test.evidenceArtifacts ?? [],
        evidenceGap,
        contract: scenarioContract({
          ...(contractSummary(contractScenarios) ?? {}),
          ...(expected ?? {}),
        }),
        errorMessage: test.errorMessage ?? null,
      };
    })
    .sort(compareScenariosBySetId);

  const report = {
    schemaVersion: 1,
    kind: 'expected-current-outcome-report',
    activityId: laneResult.activityId,
    attemptId: laneResult.attemptId,
    targetName: laneResult.targetName,
    lane: laneResult.lane,
    platform: laneResult.platform,
    result: laneResult.result,
    summary: summarizeScenarios(scenarios),
    scenarios,
    createdAt: new Date().toISOString(),
  };

  const jsonPath = resolve(laneResult.artifactDir, 'expected-current-report.json');
  const markdownPath = resolve(laneResult.artifactDir, 'expected-current-report.md');
  writeJson(jsonPath, report);
  writeMarkdownReport(markdownPath, report);

  return { report, jsonPath, markdownPath };
}

function collectSpecs(suites, parentTitles = []) {
  return suites.flatMap((suite) => {
    const nextTitles = suite.title ? [...parentTitles, suite.title] : parentTitles;
    const specs = (suite.specs ?? []).flatMap((spec) => collectSpec(spec, nextTitles));
    return [...specs, ...collectSpecs(suite.suites ?? [], nextTitles)];
  });
}

function collectSpec(spec, parentTitles) {
  return (spec.tests ?? []).map((test) => {
    const results = test.results ?? [];
    const lastResult = results.at(-1) ?? {};
    const attachments = lastResult.attachments ?? [];
    const evidenceScreenshots = attachments.filter(
      (attachment) =>
        attachment.contentType === 'image/png' &&
        attachment.path &&
        String(attachment.name ?? '').startsWith('evidence:'),
    );
    const evidenceScreenshot =
      evidenceScreenshots.find((attachment) =>
        String(attachment.name ?? '').includes('-terminal-'),
      ) ?? evidenceScreenshots[0];
    const screenshot =
      evidenceScreenshot ??
      attachments.find((attachment) => attachment.contentType === 'image/png' && attachment.path);
    const evidenceArtifacts = attachments
      .filter(
        (attachment) =>
          String(attachment.name ?? '').startsWith('evidence:') &&
          attachment.contentType !== 'image/png',
      )
      .map((attachment) => ({
        name: attachment.name,
        path: attachment.path ?? null,
        contentType: attachment.contentType ?? null,
      }));
    const errorMessage =
      results
        .flatMap((result) => result.errors ?? [])
        .map((error) => error.message || error.value)
        .filter(Boolean)
        .join('\n') || null;
    const titlePath = [...parentTitles, spec.title].filter(Boolean).join(' › ');

    return {
      title: spec.title,
      titlePath,
      file: spec.file,
      line: spec.line,
      projectName: test.projectName,
      status: lastResult.status ?? test.status,
      outcome: test.status,
      statuses: results.map((result) => result.status).filter(Boolean),
      durationMs: lastResult.duration ?? null,
      screenshotPath: screenshot?.path ?? null,
      screenshotName: screenshot?.name ?? null,
      screenshotKind: evidenceScreenshot
        ? 'scenario-evidence'
        : screenshot
          ? 'playwright-final'
          : null,
      evidenceAttachments: evidenceScreenshots.map((attachment) => ({
        name: attachment.name,
        path: attachment.path,
        contentType: attachment.contentType,
      })),
      evidenceArtifacts,
      errorMessage,
    };
  });
}

function inferScenarioId(value) {
  const unique = contractIdsFromEvidenceValue(value);
  return unique.length ? unique.join('/') : null;
}

function normalizeExpectedOutcomes(value) {
  const entries = value && typeof value === 'object' ? Object.entries(value) : [];
  return new Map(
    entries.map(([title, outcome]) => [
      title,
      typeof outcome === 'string' ? { expected: outcome } : outcome,
    ]),
  );
}

function defaultExpectedForTest({ test, target, targetDefaultExpected, contractScenarios = [] }) {
  if (contractScenarios.length) return expectedForScenarios(contractScenarios);
  if (target.runLevel === 'suite' && test.title) {
    return `Scenario should satisfy its named behavior: ${test.title}.`;
  }
  return targetDefaultExpected;
}

function defaultCurrentForTest({
  test,
  currentStatus,
  evidenceSummary,
  contractScenarios,
  platform,
}) {
  const platformLabel = platform?.label ?? platform?.id ?? test.projectName ?? 'current platform';
  const scenarioSummary = contractScenarios.length
    ? `${contractScenarios.map((scenario) => `${scenario.scenarioId} ${scenario.title}`).join(' / ')}. ${contractScenarios
        .map((scenario) => scenario.scenarioOverview)
        .filter(Boolean)
        .join(' / ')}`
    : test.title;
  if (test.outcome === 'flaky') {
    return `On ${platformLabel}, ${scenarioSummary} passed after retry. Status sequence: ${test.statuses.join(', ')}. First error: ${test.errorMessage ?? 'not captured'}. ${evidenceSummary}`;
  }
  if (test.status === 'passed') {
    return `On ${platformLabel}, ${scenarioSummary} matched the documented Settings baseline. ${evidenceSummary}`;
  }
  return `On ${platformLabel}, ${scenarioSummary} reported ${currentStatus}. ${test.errorMessage ?? ''}`.trim();
}

function descriptionForScenarios({ contractScenarios, test }) {
  if (!contractScenarios.length) return test.title;
  return contractScenarios
    .map((scenario) => `${scenario.scenarioId} ${scenario.title}: ${scenario.scenarioOverview}`)
    .join(' / ');
}

function expectedForScenarios(contractScenarios) {
  return contractScenarios
    .map((scenario) =>
      [
        `${scenario.scenarioId} ${scenario.title}`,
        scenario.scenarioOverview ? `Overview: ${scenario.scenarioOverview}` : null,
        scenario.terminalStates ? `Terminal: ${scenario.terminalStates}` : null,
        scenario.assertionsEvidence ? `Assertions: ${scenario.assertionsEvidence}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    )
    .join(' / ');
}

function contractSummary(contractScenarios) {
  if (!contractScenarios.length) return null;
  const join = (field) =>
    contractScenarios
      .map((scenario) => scenario[field])
      .filter(Boolean)
      .join(' / ');
  return {
    scenarioId: contractScenarios.map((scenario) => scenario.scenarioId).join('/'),
    scenarioOverview: join('scenarioOverview'),
    scope: join('scope'),
    interactionCoverage: join('interactionCoverage'),
    impactCoverage: join('impactCoverage'),
    preconditions: join('preconditions'),
    startState: join('startState'),
    transientStates: join('transientStates'),
    terminalStates: join('terminalStates'),
    assertionsEvidence: join('assertionsEvidence'),
    automationNotes: join('automationNotes'),
  };
}

function qaContractMap(target) {
  if (target?.contract === false) return new Map();
  return new Map(parseQaContract().map((scenario) => [scenario.scenarioId, scenario]));
}

function contractScenariosForValue(value, settingsContract) {
  return scenarioIdsFromValue(value)
    .map((scenarioId) => settingsContract.get(scenarioId))
    .filter(Boolean);
}

function scenarioIdsFromValue(value) {
  return contractIdsFromEvidenceValue(value);
}

function compareScenariosBySetId(left, right) {
  return (
    scenarioSortKey(left) - scenarioSortKey(right) || String(left.title).localeCompare(right.title)
  );
}

function scenarioSortKey(scenario) {
  const ids = scenarioIdsFromValue(`${scenario.scenarioId ?? ''} ${scenario.title ?? ''}`).map(
    (id) => Number(id.split('-').at(-1)),
  );
  return ids.length ? Math.min(...ids) : Number.MAX_SAFE_INTEGER;
}

function scenarioContract(expected) {
  if (!expected || typeof expected !== 'object') return null;
  const contract = pickDefined(expected, [
    'scenarioId',
    'id',
    'scope',
    'platforms',
    'scenarioOverview',
    'overview',
    'interactionCoverage',
    'impactCoverage',
    'preconditions',
    'startState',
    'transientStates',
    'terminalStates',
    'screenshotEvidence',
    'assertionsEvidence',
    'automationNotes',
  ]);
  return Object.keys(contract).length ? contract : null;
}

function pickDefined(source, keys) {
  return Object.fromEntries(
    keys
      .filter((key) => source[key] !== undefined && source[key] !== null && source[key] !== '')
      .map((key) => [key, source[key]]),
  );
}

function summarizeScenarios(scenarios) {
  const counts = scenarios.reduce(
    (acc, scenario) => {
      acc.total += 1;
      acc[scenario.status] = (acc[scenario.status] ?? 0) + 1;
      acc.consistency[scenario.consistency] = (acc.consistency[scenario.consistency] ?? 0) + 1;
      return acc;
    },
    { total: 0, consistency: {} },
  );
  counts.inconsistencies = scenarios.filter((scenario) =>
    ['mismatch', 'flaky-on-retry', 'evidence-gap'].includes(scenario.consistency),
  ).length;
  counts.evidenceGaps = scenarios.filter((scenario) => scenario.evidenceGap).length;
  counts.watchItems = scenarios.filter((scenario) =>
    ['documented-watch-item', 'manual-gap', 'not-applicable'].includes(scenario.consistency),
  ).length;
  return counts;
}

function writeMarkdownReport(path, report) {
  const lines = [
    `# Expected vs current outcomes: ${report.targetName}`,
    '',
    `- Platform: ${report.platform?.label ?? report.platform?.id ?? 'unknown'}`,
    `- Result: ${report.result}`,
    `- Scenarios: ${report.summary.total}`,
    `- Inconsistencies: ${report.summary.inconsistencies}`,
    `- Evidence gaps: ${report.summary.evidenceGaps ?? 0}`,
    `- Watch/manual/not-applicable: ${report.summary.watchItems}`,
    '',
  ];

  for (const scenario of report.scenarios) {
    lines.push(`## ${scenario.title}`);
    lines.push('');
    lines.push(`- Status: ${scenario.status}`);
    lines.push(`- Outcome: ${scenario.outcome}`);
    lines.push(`- Status sequence: ${(scenario.statuses ?? []).join(', ')}`);
    lines.push(`- Consistency: ${scenario.consistency}`);
    if (scenario.description) lines.push(`- Description: ${scenario.description}`);
    lines.push(`- **Expected:** ==${scenario.expected}==`);
    lines.push(`- **Current:** ==${scenario.current}==`);
    if (scenario.screenshotPath) {
      const screenshotLabel =
        scenario.screenshotKind === 'scenario-evidence'
          ? 'Scenario evidence screenshot'
          : 'Debug/final screenshot';
      lines.push(`- ${screenshotLabel}: attached`);
    }
    if (scenario.evidenceGap)
      lines.push('- Evidence gap: no scenario evidence screenshot attached');
    if (scenario.errorMessage) lines.push(`- Error: ${scenario.errorMessage}`);
    lines.push('');
  }

  ensureDir(resolve(path, '..'));
  writeFileSync(path, `${lines.join('\n')}\n`);
}
