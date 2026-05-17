export const QA_RUN_TEMPLATE = {
  name: 'qa-run',
  version: 2,
  requiredSections: ['Run Summary', 'Platforms', 'Raw Artifacts'],
};

export const FEATURE_BY_LANE = {
  smoke: 'Feature: Smoke - auth and open book',
  library: 'Feature: Library',
  reader: 'Feature: Reader',
  settings: 'Feature: Settings - billing and API keys',
  catalog: 'Feature: Explore catalog',
  sync: 'Feature: Sync - mocked offline resilience',
  'all-ui': 'Feature: All UI regression',
};

export function qaRunTemplateBlocks({ activityId, title, branch, commit, createdAt }) {
  return [
    sectionToggleBlock(
      'Run Summary',
      [
        paragraph(
          'Lean E2E QA evidence page. Lifecycle/design/build details stay out of this page.',
        ),
        bulleted(`Activity ID: ${activityId}`),
        title ? bulleted(`Scope: ${title}`) : null,
        branch ? bulleted(`Branch: ${branch}`) : null,
        commit ? bulleted(`Commit: ${commit}`) : null,
        createdAt ? bulleted(`Created: ${createdAt}`) : null,
      ].filter(Boolean),
    ),
    sectionToggleBlock('Platforms', [
      paragraph(
        'Platform → feature → run/evidence. Add platforms here as adapters become available.',
      ),
    ]),
    sectionToggleBlock('Raw Artifacts', [
      paragraph('Compact lane-result/stdout/stderr previews for each run.'),
    ]),
  ];
}

export function runSummaryBlocks({
  targetName,
  lane,
  platform,
  project,
  result,
  command,
  specs,
  grep,
  durationMs,
  screenshotCount,
  traceCount,
  videoCount,
  commit,
  artifactDir,
}) {
  const duration = durationMs ? `${Math.round(durationMs / 1000)}s` : 'unknown';
  return [
    headingBlock(`${platform?.label ?? platform?.id ?? 'Platform'} · ${targetName}: ${result}`),
    bulleted(`Platform: ${platform?.label ?? platform?.id ?? 'unknown'}`),
    project ? bulleted(`Project: ${project}`) : null,
    bulleted(`Lane: ${lane}`),
    bulleted(`Duration: ${duration}`),
    commit ? bulleted(`Commit: ${commit}`) : null,
    bulleted(`Screenshots: ${screenshotCount}; traces: ${traceCount}; videos: ${videoCount}`),
    grep ? bulleted(`Grep: ${grep}`) : null,
    specs?.length ? bulleted(`Specs: ${specs.join(', ')}`) : null,
    artifactDir ? bulleted(`Artifacts: ${artifactDir}`) : null,
    command ? codeBlock(command, 'bash', 'Command') : null,
  ].filter(Boolean);
}

export function rawArtifactBlocks({ laneResult, stdout, stderr }) {
  return [
    headingBlock(`${laneResult.platform?.id ?? 'platform'} · ${laneResult.attemptId}: raw result`),
    codeBlock(
      JSON.stringify(compactLaneResult(laneResult), null, 2),
      'json',
      'lane-result.json preview',
    ),
    stdout ? codeBlock(stdout.slice(-1800), 'plain text', 'stdout tail') : null,
    stderr ? codeBlock(stderr.slice(-1800), 'plain text', 'stderr tail') : null,
  ].filter(Boolean);
}

export function expectedCurrentBlocks({ laneResult }) {
  const report = laneResult.expectedCurrentReport;
  if (!report?.scenarios?.length) return [];

  return [
    headingBlock(
      `${laneResult.platform?.id ?? 'platform'} · ${laneResult.attemptId}: expected vs current`,
    ),
    bulleted(`Scenarios: ${report.summary.total}`),
    bulleted(`Inconsistencies: ${report.summary.inconsistencies}`),
    bulleted(`Evidence gaps: ${report.summary.evidenceGaps ?? 0}`),
    bulleted(`Watch/manual/not-applicable: ${report.summary.watchItems}`),
    ...report.scenarios.map((scenario) =>
      sectionToggleBlock(
        scenarioEvidenceBlockTitle(scenario),
        [
          codeBlock(expectedCurrentScenarioText(scenario), 'plain text', 'Expected/current'),
          ...scenarioContractBlocks(scenario),
          scenario.evidenceGap
            ? paragraph('Evidence gap: no scenario evidence screenshot attached.')
            : null,
        ].filter(Boolean),
      ),
    ),
  ];
}

export function scenarioEvidenceBlockTitle(scenario) {
  return `Scenario: ${scenario.title}`;
}

export function expectedCurrentScenarioText(scenario) {
  return [
    scenario.scenarioId ? `Scenario ID: ${scenario.scenarioId}` : null,
    `Status: ${scenario.status}`,
    `Outcome: ${scenario.outcome}`,
    `Status sequence: ${(scenario.statuses ?? []).join(', ')}`,
    `Consistency: ${scenario.consistency}`,
    `Expected: ${scenario.expected}`,
    `Current: ${scenario.current}`,
    scenario.evidenceGap ? 'Evidence gap: no scenario evidence screenshot attached.' : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function scenarioContractBlocks(scenario) {
  const contract = scenario.contract;
  if (!contract || typeof contract !== 'object') return [];

  const lines = [
    ['Scope', contract.scope],
    ['Platforms', contract.platforms],
    ['Scenario overview', contract.scenarioOverview ?? contract.overview],
    ['Interaction coverage', contract.interactionCoverage],
    ['Impact coverage', contract.impactCoverage],
    ['Preconditions', contract.preconditions],
    ['Start state', contract.startState],
    ['Transient states', contract.transientStates],
    ['Terminal states', contract.terminalStates],
    ['Screenshot evidence', contract.screenshotEvidence],
    ['Assertions/evidence', contract.assertionsEvidence],
    ['Automation notes', contract.automationNotes],
  ]
    .map(([label, value]) => formatContractLine(label, value))
    .filter(Boolean);

  return lines.length ? [codeBlock(lines.join('\n'), 'plain text', 'Scenario contract')] : [];
}

function formatContractLine(label, value) {
  const text = contractValueText(value);
  return text ? `${label}: ${text}` : null;
}

function contractValueText(value) {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) return value.map(contractValueText).filter(Boolean).join('; ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function featureSectionName(lane) {
  return FEATURE_BY_LANE[lane] ?? 'Feature: Custom run';
}

export function evidenceSectionPath({ platform, lane, section }) {
  return [
    'Platforms',
    platform?.label ?? platform?.id ?? 'Unknown platform',
    featureSectionName(lane),
    section,
  ].join('/');
}

export function sectionToggleBlock(text, children = []) {
  return {
    object: 'block',
    type: 'toggle',
    toggle: {
      rich_text: richText(text),
      children,
    },
  };
}

export function headingBlock(text) {
  return {
    object: 'block',
    type: 'heading_3',
    heading_3: { rich_text: richText(text) },
  };
}

export function paragraph(text) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: richText(text) },
  };
}

export function bulleted(text) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: richText(text) },
  };
}

export function codeBlock(text, language = 'plain text', caption = '') {
  return {
    object: 'block',
    type: 'code',
    code: {
      language,
      caption: caption ? richText(caption) : [],
      rich_text: richText(String(text).slice(0, 1900)),
    },
  };
}

export function richText(text) {
  return [{ type: 'text', text: { content: String(text ?? '').slice(0, 1900) } }];
}

function compactLaneResult(laneResult) {
  return {
    result: laneResult.result,
    activityId: laneResult.activityId,
    attemptId: laneResult.attemptId,
    targetName: laneResult.targetName,
    lane: laneResult.lane,
    platform: laneResult.platform,
    adapter: laneResult.adapter,
    project: laneResult.project,
    command: laneResult.command,
    specs: laneResult.specs,
    grep: laneResult.grep,
    git: laneResult.git,
    artifactDir: laneResult.artifactDir,
    screenshotCount: laneResult.screenshotCount,
    traceCount: laneResult.traceCount,
    videoCount: laneResult.videoCount,
    expectedCurrentReportPath: laneResult.expectedCurrentReportPath,
    expectedCurrentMarkdownPath: laneResult.expectedCurrentMarkdownPath,
    consistencySummary: laneResult.expectedCurrentReport?.summary,
    startedAt: laneResult.startedAt,
    finishedAt: laneResult.finishedAt,
    durationMs: laneResult.durationMs,
  };
}
