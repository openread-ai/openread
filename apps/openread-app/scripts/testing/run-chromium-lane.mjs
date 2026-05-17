#!/usr/bin/env node
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ensureDir,
  getActivityConfig,
  loadActivityEnv,
  parseArgs,
  writeJson,
} from '../activity/common.mjs';
import {
  completedScenarioGrepInvert,
  qaRunTrackerEnabled,
  readQaRunTrackerEntries,
  summarizeRunTrackerEntries,
} from '../../e2e/reporters/qa-run-tracker.mjs';

const DEFAULT_NOTION_PAGE = '34c159c7f71980b99fdbf952588a4f50';

const argv = process.argv.slice(2);
const args = parseArgs(argv);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '../..');
loadActivityEnv();
if (args.help || args.h) {
  printHelp();
  process.exit(0);
}

const config = getActivityConfig(argv);
const lane = String(args.lane ?? 'chromium-smoke');
const artifactDir = resolve(config.attemptDir, 'testing', lane);
const outputDir = resolve(artifactDir, 'playwright-output');
const resultPath = resolve(artifactDir, 'playwright-results.json');
const stdoutPath = resolve(artifactDir, 'stdout.log');
const stderrPath = resolve(artifactDir, 'stderr.log');
const validationReportPath = resolve(
  config.attemptDir,
  'stage-8-validation',
  'validation-report.json',
);
const notionPage =
  args.notionPage ??
  process.env.OPENREAD_NOTION_EVIDENCE_PAGE_ID ??
  process.env.OPENREAD_NOTION_ACTIVITY_PAGE_ID ??
  DEFAULT_NOTION_PAGE;
const specs = resolveSpecs(args.specs ?? args.spec, lane);
const grep = args.grep ? String(args.grep) : null;
const videoMode = resolveVideoMode(
  args.video ?? args.videoMode ?? process.env.OPENREAD_PLAYWRIGHT_VIDEO,
);
const runLevel = resolveRunLevel(args.runLevel, { lane, grep });
const manualCase = resolveManualCase(args.manualCase ?? args.case, lane);
const runLabel = resolveRunLabel({
  runLevel,
  lane,
  manualCase,
  scenario: args.scenario ?? args.label ?? grep,
});
const qaEvidence = qaEvidenceForLane(lane, { runLevel, manualCase, runLabel });
const notionToken = process.env.NOTION_TOKEN ?? process.env.NOTION_API_KEY;
const trackerSectionPath = 'Chromium';
const summarySectionPath = 'Run Summary/Platforms/Chromium';
const trackerEnabled =
  args.uploadNotion !== 'false' &&
  args.uploadNotion !== false &&
  qaRunTrackerEnabled({ notionToken, pageId: notionPage });
const resumeFromNotion =
  args.resumeFromNotion === 'false' || args.resumeFromNotion === false ? false : trackerEnabled;
const trackerEntries = trackerEnabled
  ? await readQaRunTrackerEntries({
      notionToken,
      pageId: String(notionPage),
      sectionPath: trackerSectionPath,
    }).catch((error) => {
      console.error(`QA Run Tracker read failed: ${error.message}`);
      return [];
    })
  : [];
const trackerSummary = summarizeRunTrackerEntries(trackerEntries, config.attemptId);
const resumeGrepInvert = resumeFromNotion
  ? completedScenarioGrepInvert(trackerEntries, config.attemptId)
  : null;
const startedAtMs = Date.now();
const startedAt = new Date(startedAtMs).toISOString();

ensureDir(artifactDir);
ensureDir(outputDir);

const command = [
  'pnpm',
  'exec',
  'playwright',
  'test',
  '--project=chromium',
  `--reporter=${playwrightReporters().join(',')}`,
  `--output=${outputDir}`,
  ...(grep ? ['--grep', grep] : []),
  ...(resumeGrepInvert ? ['--grep-invert', resumeGrepInvert] : []),
  ...specs,
];

const git = gitSummary();
const run = spawnSync('corepack', command, {
  cwd: appRoot,
  env: {
    ...process.env,
    OPENREAD_PLAYWRIGHT_SCREENSHOT: process.env.OPENREAD_PLAYWRIGHT_SCREENSHOT ?? 'on',
    OPENREAD_PLAYWRIGHT_VIDEO: videoMode,
    OPENREAD_QA_TRACKER_ENABLED: trackerEnabled ? 'true' : 'false',
    OPENREAD_QA_TRACKER_PAGE_ID: String(notionPage),
    OPENREAD_QA_TRACKER_SECTION_PATH: trackerSectionPath,
    OPENREAD_QA_SUMMARY_SECTION_PATH: summarySectionPath,
    OPENREAD_ACTIVITY_ID: config.activityId,
    OPENREAD_QA_RUN_ID: config.attemptId,
    OPENREAD_QA_LANE: lane,
    OPENREAD_QA_RUN_LEVEL: runLevel,
    OPENREAD_QA_INCREMENTAL_EVIDENCE: 'true',
    OPENREAD_QA_FEATURE: qaEvidence.feature,
    OPENREAD_QA_MANUAL_CASE: manualCase?.title ?? '',
    PLAYWRIGHT_JSON_OUTPUT_NAME: resultPath,
    PLAYWRIGHT_HTML_OPEN: 'never',
  },
  encoding: 'utf8',
  stdio: 'pipe',
  maxBuffer: 50 * 1024 * 1024,
});

writeFileSync(stdoutPath, redact(run.stdout ?? ''));
writeFileSync(stderrPath, redact(run.stderr ?? ''));
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);

const screenshots = findFiles(outputDir, (name) => name.endsWith('.png'));
const traces = findFiles(outputDir, (name) => name.endsWith('.zip'));
const videos = findFiles(outputDir, (name) => name.endsWith('.webm'));
const exitCode = run.status ?? (run.signal ? 1 : 0);
const laneResult = {
  schemaVersion: 1,
  stage: 'chromium-lane',
  result: exitCode === 0 ? 'passed' : 'failed',
  lane,
  platform: 'chromium',
  platforms: ['chromium'],
  activityId: config.activityId,
  activityUuid: config.activityUuid,
  attemptId: config.attemptId,
  command: `corepack ${command.join(' ')}`,
  specs,
  grep,
  runLevel,
  runLabel,
  manualCase,
  resumeFromNotion,
  resumeGrepInvert,
  trackerSummary,
  git,
  artifactDir,
  outputDir,
  playwrightResultsPath: existsSync(resultPath) ? resultPath : null,
  stdoutPath,
  stderrPath,
  screenshots,
  screenshotCount: screenshots.length,
  traces,
  traceCount: traces.length,
  videos,
  videoCount: videos.length,
  videoMode,
  exitCode,
  signal: run.signal ?? null,
  startedAt,
  finishedAt: new Date().toISOString(),
  durationMs: Date.now() - startedAtMs,
  notionPageId: notionPage,
  qaEvidence,
  validationReportPath,
  nextAction:
    exitCode === 0
      ? 'Review uploaded evidence and continue expanding Chromium Playwright coverage.'
      : 'Investigate the failing Chromium Playwright lane before expanding coverage.',
  createdAt: startedAt,
};

const laneResultPath = resolve(artifactDir, 'lane-result.json');
writeJson(laneResultPath, laneResult);

const notionUploads = await uploadNotionEvidence({
  laneResultPath,
  stdoutPath,
  stderrPath,
  screenshots,
  traces,
  videos,
});
const completed = { ...laneResult, notionUploads };
writeJson(laneResultPath, completed);
writeJson(validationReportPath, validationReportFromLane(completed));
console.log(JSON.stringify(completed, null, 2));
process.exit(exitCode === 0 ? 0 : 1);

function playwrightReporters() {
  const reporters = ['line', 'json'];
  if (trackerEnabled) reporters.push('./e2e/reporters/qa-run-tracker-reporter.mjs');
  return reporters;
}

function resolveSpecs(value, laneName) {
  if (value) {
    return String(value)
      .split(',')
      .map((spec) => spec.trim())
      .filter(Boolean);
  }

  if (laneName === 'chromium-library') return ['e2e/tests/library'];
  if (laneName === 'chromium-reader') return ['e2e/tests/reader'];
  if (laneName === 'chromium-settings') return ['e2e/tests/settings'];
  if (laneName === 'chromium-catalog') return ['e2e/tests/catalog'];
  if (laneName === 'chromium-sync') return ['e2e/tests/sync'];
  if (laneName === 'chromium-all-ui') return ['e2e/tests'];
  return ['e2e/tests/ui/auth.spec.ts', 'e2e/tests/ui/open-book.spec.ts'];
}

function resolveVideoMode(value) {
  const allowed = new Set(['off', 'on', 'retain-on-failure', 'on-first-retry']);
  const mode = String(value ?? 'retain-on-failure');
  return allowed.has(mode) ? mode : 'retain-on-failure';
}

function resolveRunLevel(value, { lane: laneName, grep: grepPattern }) {
  const explicit = String(value ?? '').toLowerCase();
  if (['scenario', 'feature', 'suite'].includes(explicit)) return explicit;
  if (grepPattern || args.scenario || args.label || args.manualCase || args.case) return 'scenario';
  if (laneName === 'chromium-all-ui') return 'suite';
  return 'feature';
}

function resolveManualCase(value, laneName) {
  const key = String(value ?? defaultManualCaseKeyForLane(laneName) ?? '')
    .trim()
    .toLowerCase();
  if (!key) return null;
  if (key.startsWith('manual case ')) return { key: slugLabel(key), title: String(value).trim() };

  const manualCases = {
    2: 'Manual case 2: Auth and library',
    'auth-library': 'Manual case 2: Auth and library',
    library: 'Manual case 2: Auth and library',
    3: 'Manual case 3: Reader routes, deep links, and render',
    'reader-routes': 'Manual case 3: Reader routes, deep links, and render',
    4: 'Manual case 4: Header and top-menu controls',
    'reader-header': 'Manual case 4: Header and top-menu controls',
    5: 'Manual case 5: View Options and reader modes',
    'view-options': 'Manual case 5: View Options and reader modes',
    '5a': 'Manual case 5a: Settings dialog nested panels',
    'reader-settings': 'Manual case 5a: Settings dialog nested panels',
    settings: 'Manual case 5a: Settings dialog nested panels',
    6: 'Manual case 6: Footer and reading controls',
    'reader-footer': 'Manual case 6: Footer and reading controls',
    9: 'Manual case 9: Sidebar, book menu, search, and notebook',
    sidebar: 'Manual case 9: Sidebar, book menu, search, and notebook',
    notebook: 'Manual case 9: Sidebar, book menu, search, and notebook',
    10: 'Manual case 10: Selection popup and annotations',
    annotations: 'Manual case 10: Selection popup and annotations',
    12: 'Manual case 12: Quota and billing',
    billing: 'Manual case 12: Quota and billing',
    13: 'Manual case 13: Sync and offline',
    sync: 'Manual case 13: Sync and offline',
    offline: 'Manual case 13: Sync and offline',
    14: 'Manual case 14: Catalog and imports',
    catalog: 'Manual case 14: Catalog and imports',
    explore: 'Manual case 14: Catalog and imports',
    16: 'Manual case 16: Accessibility and UX',
    accessibility: 'Manual case 16: Accessibility and UX',
    ux: 'Manual case 16: Accessibility and UX',
    18: 'Manual case 18: Paid-tier behavior addendum',
    tiers: 'Manual case 18: Paid-tier behavior addendum',
  };
  const title = manualCases[key];
  return title ? { key, title } : { key: slugLabel(key), title: String(value).trim() };
}

function defaultManualCaseKeyForLane(laneName) {
  if (laneName === 'chromium-smoke') return '2';
  if (laneName === 'chromium-library') return '2';
  if (laneName === 'chromium-settings') return '12';
  if (laneName === 'chromium-catalog') return '14';
  if (laneName === 'chromium-sync') return '13';
  return null;
}

function resolveRunLabel({ runLevel, lane: laneName, manualCase, scenario }) {
  if (runLevel === 'feature' || runLevel === 'suite') return laneName;
  const scenarioSlug = slugLabel(scenario ?? manualCase?.key ?? laneName);
  return scenarioSlug.startsWith('scenario-') ? scenarioSlug : `scenario-${scenarioSlug}`;
}

function qaEvidenceForLane(laneName, { runLevel, manualCase, runLabel }) {
  const platform = 'Platform: Web - Chromium';
  const featureByLane = {
    'chromium-smoke': 'Feature: Smoke - auth and open book',
    'chromium-library': 'Feature: Library',
    'chromium-reader': 'Feature: Reader',
    'chromium-settings': 'Feature: Settings - billing and API keys',
    'chromium-catalog': 'Feature: Explore catalog',
    'chromium-sync': 'Feature: Sync - mocked offline resilience',
    'chromium-all-ui': 'Feature: All Chromium UI regression',
  };
  const feature = featureByLane[laneName] ?? 'Feature: All Chromium UI regression';
  const sectionPath = 'Chromium';

  return { platform, feature, manualCase, runLevel, runLabel, sectionPath };
}

function slugLabel(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function validationReportFromLane(laneReport) {
  return {
    schemaVersion: 1,
    stage: 'stage-8-validation',
    result: laneReport.result,
    activityId: laneReport.activityId,
    activityUuid: laneReport.activityUuid,
    attemptId: laneReport.attemptId,
    lane: laneReport.lane,
    platform: laneReport.platform,
    platforms: laneReport.platforms,
    runLevel: laneReport.runLevel,
    runLabel: laneReport.runLabel,
    manualCase: laneReport.manualCase,
    grep: laneReport.grep,
    resumeFromNotion: laneReport.resumeFromNotion,
    resumeGrepInvert: laneReport.resumeGrepInvert,
    trackerSummary: laneReport.trackerSummary,
    command: laneReport.command,
    checks: [
      {
        name: `${laneReport.runLabel} Playwright ${laneReport.runLevel} run`,
        result: laneReport.result,
        platform: laneReport.platform,
        specs: laneReport.specs,
        grep: laneReport.grep,
      },
    ],
    artifactDir: laneReport.artifactDir,
    laneResultPath,
    outputDir: laneReport.outputDir,
    playwrightResultsPath: laneReport.playwrightResultsPath,
    stdoutPath: laneReport.stdoutPath,
    stderrPath: laneReport.stderrPath,
    screenshotCount: laneReport.screenshotCount,
    traceCount: laneReport.traceCount,
    videoCount: laneReport.videoCount,
    videoMode: laneReport.videoMode,
    notionPageId: laneReport.notionPageId,
    qaEvidence: laneReport.qaEvidence,
    notionUploads: laneReport.notionUploads,
    startedAt: laneReport.startedAt,
    finishedAt: laneReport.finishedAt,
    durationMs: laneReport.durationMs,
    nextAction: laneReport.nextAction,
    createdAt: laneReport.createdAt,
  };
}

async function uploadNotionEvidence({ laneResultPath, stdoutPath, stderrPath }) {
  if (args.uploadNotion === 'false' || args.uploadNotion === false) return { skipped: true };
  if (!notionPage) return { skipped: true, reason: 'No Notion page configured.' };

  const uploads = [];
  uploads.push(
    runUpload('raw-artifacts', [
      '--files',
      [laneResultPath, stdoutPath, stderrPath].join(','),
      '--text-only',
      '--section-path',
      'Raw Artifacts',
      '--heading',
      `${config.attemptId}: raw logs and result`,
    ]),
  );

  return uploads;
}

function runUpload(label, extraArgs) {
  const upload = spawnSync(
    'node',
    [
      'scripts/activity/notion-upload-file.mjs',
      '--activity',
      config.activityId,
      '--attempt',
      config.attemptId,
      '--page',
      String(notionPage),
      ...extraArgs,
    ],
    {
      cwd: appRoot,
      env: process.env,
      encoding: 'utf8',
      stdio: 'pipe',
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  return {
    label,
    exitCode: upload.status ?? (upload.signal ? 1 : 0),
    signal: upload.signal ?? null,
    summary: parseJsonFromOutput(upload.stdout),
    stdout: redact(upload.stdout ?? '').slice(-4_000),
    stderr: redact(upload.stderr ?? '').slice(-4_000),
  };
}

function findFiles(dir, predicate) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return findFiles(path, predicate);
    return entry.isFile() && predicate(entry.name) ? [path] : [];
  });
}

function gitSummary() {
  return {
    branch: runGit(['branch', '--show-current']),
    commit: runGit(['rev-parse', 'HEAD']),
    status: runGit(['status', '--short']),
  };
}

function runGit(args) {
  const result = spawnSync('git', args, { cwd: appRoot, encoding: 'utf8', stdio: 'pipe' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function parseJsonFromOutput(output) {
  const index = String(output ?? '').indexOf('{');
  if (index === -1) return null;
  try {
    return JSON.parse(output.slice(index));
  } catch {
    return null;
  }
}

function redact(value) {
  return String(value)
    .replace(/orsk-[A-Za-z0-9_-]+/g, 'orsk-REDACTED')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer REDACTED')
    .replace(
      /("?(?:token|refresh_token|access_token|password|secret|key)"?\s*[:=]\s*")([^"\n]+)(")/gi,
      '$1REDACTED$3',
    );
}

function printHelp() {
  console.log(`Chromium lane runner

Usage:
  pnpm test:lane:chromium-smoke
  pnpm test:lane:chromium-library
  pnpm test:lane:chromium-reader
  pnpm test:lane:chromium-settings
  pnpm test:lane:chromium-catalog
  node scripts/testing/run-chromium-lane.mjs --lane chromium-reader --specs e2e/tests/reader
  node scripts/testing/run-chromium-lane.mjs --lane chromium-reader --run-level scenario --manual-case 5a --scenario settings-panels --grep "settings dialog"

Options:
  --lane <name>          chromium-smoke | chromium-library | chromium-reader | chromium-settings | chromium-catalog | chromium-sync | chromium-all-ui | custom
  --specs <a,b>          Comma-separated Playwright spec paths
  --grep <pattern>       Playwright --grep pattern for a specific scenario run
  --run-level <level>    scenario | feature | suite (auto-detected when omitted)
  --manual-case <key>    Manual checklist key/title, e.g. 5a, reader-settings, 14, catalog
  --scenario <slug>      Scenario/option-path label for Notion evidence
  --resume-from-notion false
                         Disable Notion QA Run Tracker resume filtering for this run ID
  --activity <id>        Activity artifact id (default: sandbox-activity)
  --attempt <id>         Attempt id (default: timestamp)
  --notion-page <id>     Page for evidence upload
  --video <mode>         off | on | retain-on-failure | on-first-retry (default: retain-on-failure)
  --upload-notion false  Disable Notion upload attempts
`);
}
