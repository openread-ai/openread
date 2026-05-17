import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  APP_ROOT,
  activityPaths,
  ensureDir,
  findFiles,
  gitSummary,
  readJsonIfExists,
  redact,
  sanitizeName,
  writeJson,
} from '../lib/common.mjs';

const TARGET_COMMANDS = new Map([
  ['settings', 'settings'],
  ['native-settings-contract', 'settings'],
  ['native-health', 'health'],
  ['platform-health', 'health'],
  ['capture', 'capture'],
]);

export function runNativeCtlTarget({ activity, target, platform, attemptId, options = {} }) {
  const paths = activityPaths(activity.activityId, attemptId);
  const platformDir = sanitizeName(platform.id);
  const targetDir = sanitizeName(target.name);
  const artifactDir = resolve(paths.attemptDir, 'testing', platformDir, targetDir);
  const stdoutPath = resolve(artifactDir, 'stdout.log');
  const stderrPath = resolve(artifactDir, 'stderr.log');
  const laneResultPath = resolve(artifactDir, 'lane-result.json');
  ensureDir(artifactDir);

  const commandName = resolveNativeCommand(target, options);
  const scriptName = nativeScriptName(commandName);
  const command = [
    'pnpm',
    scriptName,
    '--',
    ...(scriptName === 'native:ctl' ? [commandName] : []),
    '--activity',
    activity.activityId,
    '--attempt',
    attemptId,
    '--platform',
    platform.id,
    ...nativeOptionArgs(options),
  ];

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const git = gitSummary();
  const run = spawnSync('corepack', command, {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      NEXT_PUBLIC_APP_PLATFORM: platform.appPlatform ?? 'tauri',
      OPENREAD_ACTIVITY_ID: activity.activityId,
      OPENREAD_QA_RUN_ID: attemptId,
      OPENREAD_QA_LANE: target.lane,
      OPENREAD_QA_TARGET: target.name,
      OPENREAD_QA_PLATFORM: platform.id,
    },
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 50 * 1024 * 1024,
  });

  writeFileSync(stdoutPath, redact(run.stdout ?? ''));
  writeFileSync(stderrPath, redact(run.stderr ?? ''));
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);

  const nativeReportPath = resolve(paths.attemptDir, 'native-ctl', 'native-ctl-report.json');
  const nativeReport = readJsonIfExists(nativeReportPath);
  const nativeLaneResult = findNativeLaneResult({ nativeReport, platformId: platform.id });
  const generatedExpectedCurrent = nativeLaneResult?.expectedCurrentReportPath
    ? null
    : writeNativeCtlExpectedCurrent({
        nativeReport,
        artifactDir,
        activity,
        attemptId,
        target,
        platform,
      });
  const expectedCurrentReportPath =
    nativeLaneResult?.expectedCurrentReportPath ?? generatedExpectedCurrent?.jsonPath ?? null;
  const expectedCurrentMarkdownPath = generatedExpectedCurrent?.markdownPath ?? null;
  const screenshots = findFiles(paths.attemptDir, (name) => name.endsWith('.png'));
  const exitCode = run.status ?? (run.signal ? 1 : 0);
  const result = exitCode === 0 ? 'passed' : 'failed';
  const finishedAt = new Date().toISOString();
  const laneResult = {
    schemaVersion: 1,
    stage: 'e2e-qa-run',
    result,
    activityId: activity.activityId,
    activityUuid: activity.activityUuid,
    attemptId,
    targetName: target.name,
    lane: target.lane,
    runLevel: target.runLevel,
    platform,
    adapter: 'native-ctl',
    project: platform.id,
    command: `corepack ${command.join(' ')}`,
    specs: target.specs,
    grep: target.grep ?? null,
    git,
    artifactDir,
    outputDir: nativeLaneResult?.artifactDir ?? resolve(paths.attemptDir, 'native-ctl'),
    nativeReportPath: existsSync(nativeReportPath) ? nativeReportPath : null,
    expectedCurrentReportPath,
    expectedCurrentMarkdownPath,
    expectedCurrentReport: expectedCurrentReportPath
      ? readJsonIfExists(expectedCurrentReportPath)
      : null,
    stdoutPath,
    stderrPath,
    laneResultPath,
    screenshots,
    screenshotCount: screenshots.length,
    traces: [],
    traceCount: 0,
    videos: [],
    videoCount: 0,
    exitCode,
    signal: run.signal ?? null,
    startedAt,
    finishedAt,
    durationMs: Date.now() - startedAtMs,
    nextTarget: target.promoteTo ?? null,
    createdAt: startedAt,
  };

  writeJson(laneResultPath, laneResult);
  return laneResult;
}

function resolveNativeCommand(target, options) {
  const explicit = options.nativeCommand ?? options.command;
  if (explicit) return String(explicit);
  return TARGET_COMMANDS.get(target.name) ?? TARGET_COMMANDS.get(target.lane) ?? 'health';
}

function nativeScriptName(commandName) {
  if (commandName === 'settings') return 'native:settings';
  if (commandName === 'capture') return 'native:ctl';
  if (commandName === 'readiness') return 'native:readiness';
  return 'native:health';
}

function nativeOptionArgs(options) {
  const passThrough = [
    'appiumUrl',
    'tauriDriverUrl',
    'route',
    'openUrl',
    'application',
    'macosApplication',
    'windowsApplication',
    'tauriMacosApplication',
    'tauriWindowsApplication',
    'auth',
    'iosApp',
    'iosDeviceName',
    'iosPlatformVersion',
    'iosSimulator',
    'ipadDeviceName',
    'ipadosPlatformVersion',
    'ipadosSimulator',
    'androidDeviceName',
    'androidSerial',
    'androidActivity',
    'delayMs',
    'webviewTimeoutMs',
    'adbExecTimeout',
    'scenario',
    'scenarios',
    'scenarioId',
    'scenarioIds',
  ];

  return passThrough.flatMap((key) => {
    const value = options[key];
    if (value === undefined || value === null || value === false) return [];
    const flag = `--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
    return value === true ? [flag] : [flag, String(value)];
  });
}

function writeNativeCtlExpectedCurrent({
  nativeReport,
  artifactDir,
  activity,
  attemptId,
  target,
  platform,
}) {
  const entries = nativeReportEntries(nativeReport, platform.id);
  if (!entries.length) return null;

  const scenarios = entries.map((entry) => {
    const status = entry.result === 'passed' ? 'passed' : 'failed';
    const screenshotPath = primaryScreenshot(entry);
    return {
      title: `${platform.label ?? platform.id} ${nativeReport.command} controller health`,
      titlePath: `Native ctl › ${platform.label ?? platform.id} › ${nativeReport.command}`,
      file: 'e2e/native/ctl.mjs',
      line: null,
      project: 'native-ctl',
      scenarioId: null,
      expected: expectedForNativeCommand(nativeReport.command),
      current: currentForNativeEntry(entry),
      consistency: status === 'passed' ? 'matched' : 'mismatch',
      status,
      outcome: status,
      statuses: [status],
      durationMs: null,
      screenshotPath,
      screenshotName: screenshotPath
        ? `evidence:${platform.id}-${nativeReport.command}-controller-health`
        : null,
      screenshotKind: screenshotPath ? 'scenario-evidence' : null,
      evidenceGap: status === 'passed' && !screenshotPath,
      contract: null,
      errorMessage: entry.error ?? null,
    };
  });

  const report = {
    schemaVersion: 1,
    kind: 'expected-current-outcome-report',
    activityId: activity.activityId,
    attemptId,
    targetName: target.name,
    lane: target.lane,
    platform,
    result: nativeReport.result,
    summary: summarizeSyntheticScenarios(scenarios),
    scenarios,
    createdAt: new Date().toISOString(),
  };
  const jsonPath = resolve(artifactDir, 'expected-current-report.json');
  const markdownPath = resolve(artifactDir, 'expected-current-report.md');
  writeJson(jsonPath, report);
  writeFileSync(markdownPath, nativeCtlExpectedMarkdown(report));
  return { report, jsonPath, markdownPath };
}

function nativeReportEntries(nativeReport, platformId) {
  if (!nativeReport) return [];
  const collections = [nativeReport.health, nativeReport.captures, nativeReport.checks].filter(
    Array.isArray,
  );
  return collections.flat().filter((entry) => entry.platform === platformId);
}

function expectedForNativeCommand(commandName) {
  if (commandName === 'capture')
    return 'Native controller launches the requested app route and captures a screenshot.';
  if (commandName === 'readiness')
    return 'Native controller dependencies and installed app prerequisites are available.';
  return 'Native controller launches the app, exposes a controllable WebView, injects/clears auth without secrets in deep links, and captures deterministic screenshots.';
}

function currentForNativeEntry(entry) {
  if (entry.result !== 'passed') return entry.error ?? 'Native ctl command failed.';
  const phaseNames = (entry.phases ?? []).map((phase) => phase.name).filter(Boolean);
  const checkNames = (entry.checks ?? []).filter((check) => check.ok).map((check) => check.label);
  const summary = phaseNames.length ? phaseNames : checkNames;
  return summary.length
    ? `Native ctl passed. Verified: ${summary.join(', ')}.`
    : 'Native ctl passed and produced controller-backed evidence.';
}

function primaryScreenshot(entry) {
  if (entry.screenshotPath) return entry.screenshotPath;
  const paths = Object.values(entry.screenshotPaths ?? {}).filter(Boolean);
  return paths.at(-1) ?? null;
}

function summarizeSyntheticScenarios(scenarios) {
  const consistency = scenarios.reduce((counts, scenario) => {
    counts[scenario.consistency] = (counts[scenario.consistency] ?? 0) + 1;
    return counts;
  }, {});
  return {
    total: scenarios.length,
    passed: scenarios.filter((scenario) => scenario.status === 'passed').length,
    failed: scenarios.filter((scenario) => scenario.status !== 'passed').length,
    consistency,
    inconsistencies: scenarios.filter((scenario) => scenario.consistency !== 'matched').length,
    evidenceGaps: scenarios.filter((scenario) => scenario.evidenceGap).length,
    watchItems: 0,
  };
}

function nativeCtlExpectedMarkdown(report) {
  const lines = [
    `# Expected vs current outcomes: ${report.targetName}`,
    '',
    `- Platform: ${report.platform?.label ?? report.platform?.id}`,
    `- Result: ${report.result}`,
    `- Scenarios: ${report.summary.total}`,
    `- Inconsistencies: ${report.summary.inconsistencies}`,
    `- Evidence gaps: ${report.summary.evidenceGaps}`,
    '',
  ];
  for (const scenario of report.scenarios) {
    lines.push(`## ${scenario.title}`);
    lines.push('');
    lines.push(`- Status: ${scenario.status}`);
    lines.push(`- Consistency: ${scenario.consistency}`);
    lines.push(`- Expected: ${scenario.expected}`);
    lines.push(`- Current: ${scenario.current}`);
    if (scenario.screenshotPath) lines.push('- Scenario evidence screenshot: attached');
    if (scenario.errorMessage) lines.push(`- Error: ${scenario.errorMessage}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function findNativeLaneResult({ nativeReport, platformId }) {
  const entries = [
    ...(nativeReport?.settings ?? []),
    ...(nativeReport?.health ?? []),
    ...(nativeReport?.captures ?? []),
  ];
  const entry = entries.find((candidate) => candidate.platform === platformId);
  if (!entry?.laneResultPath) return null;
  return readJsonIfExists(entry.laneResultPath);
}
