#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPlatformTarget } from './adapters/index.mjs';
import {
  activityPaths,
  ensureQaActivity,
  findFiles,
  loadEnvFiles,
  parseArgs,
  readActivity,
  readJsonIfExists,
  sanitizeName,
  shortPath,
  timestampAttempt,
  updateActivity,
  writeJson,
} from './lib/common.mjs';
import { appendRunEvidence, ensureQaRunNotionPage, verifyQaRunNotionPage } from './lib/notion.mjs';
import {
  ensureLightweightEvidencePage,
  gcNotionEvidence,
  publishPlatformEvidence,
  updatePlatformStatus,
} from './lib/notion-evidence.mjs';
import { buildExpectedCurrentReport } from './lib/outcomes.mjs';
import { buildSettingsContractCoverage } from './lib/settings-contract.mjs';

const qaRoot = dirname(fileURLToPath(import.meta.url));
const targetsPath = resolve(qaRoot, 'targets.json');
const platformsPath = resolve(qaRoot, 'registry/platforms.json');
const matricesPath = resolve(qaRoot, 'registry/matrices.json');
const featureRegistryRoot = resolve(qaRoot, 'registry/features');
const adHocRegistryPath = resolve(qaRoot, 'registry/ad-hoc.json');
const debugTargetsRegistryPath = resolve(qaRoot, 'registry/debug-targets.json');
const args = parseArgs(process.argv.slice(2));
const commandName = args._[0] ?? 'help';

loadEnvFiles();

try {
  if (commandName === 'run') await runCommand();
  else if (commandName === 'platform-run') await platformRunCommand();
  else if (commandName === 'matrix-run') await matrixRunCommand();
  else if (commandName === 'platform-publish') await platformPublishCommand();
  else if (commandName === 'notion-init') await notionInitCommand();
  else if (commandName === 'gc') await gcCommand();
  else if (commandName === 'rerun') await rerunCommand();
  else if (commandName === 'continue') await continueCommand();
  else if (commandName === 'verify') await verifyCommand();
  else if (commandName === 'contract') await contractCommand();
  else if (commandName === 'targets') printJson(loadTargets());
  else if (commandName === 'platforms') printJson(loadPlatforms());
  else if (commandName === 'matrices') printJson(loadMatrices());
  else printHelp();
} catch (error) {
  console.error(`QA command failed: ${error.message}`);
  process.exit(1);
}

async function runCommand({ targetNameOverride, platformIdsOverride } = {}) {
  const targetName = targetNameOverride ?? args.target ?? args.lane;
  const { activity: initialActivity } = ensureQaActivity({
    activityId: args.activity,
    title: args.title,
    slug: args.slug,
  });
  const localOnly =
    args.localOnly === true || args.uploadNotion === 'false' || args.uploadNotion === false;
  const target = resolveTarget(targetName, args);
  const platforms = resolvePlatforms({ target, parsedArgs: args, platformIdsOverride });
  const baseAttemptId = sanitizeName(
    args.attempt ??
      `${target.name}-${platforms.length > 1 ? (args.matrix ?? target.matrix ?? 'matrix') : platforms[0].id}-${timestampAttempt()}`,
  );

  let activity = initialActivity;
  if (!localOnly) {
    const ensured = await ensureQaRunNotionPage({ activity, localOnly });
    activity = ensured.activity;
  }

  const runs = [];
  for (const platform of platforms) {
    const attemptId = platforms.length === 1 ? baseAttemptId : `${baseAttemptId}-${platform.id}`;
    const laneResult = runPlatformTarget({
      activity,
      target,
      platform,
      attemptId,
      options: args,
    });
    const expectedCurrent = resolveExpectedCurrentReport({ laneResult, target });
    laneResult.expectedCurrentReport = expectedCurrent.report;
    laneResult.expectedCurrentReportPath = expectedCurrent.jsonPath;
    laneResult.expectedCurrentMarkdownPath = expectedCurrent.markdownPath;
    writeJson(laneResult.laneResultPath, laneResult);

    let notion = { skipped: localOnly };
    if (!localOnly) {
      notion = await appendRunEvidence({
        activity,
        laneResult,
        stdout: readFileIfExists(laneResult.stdoutPath),
        stderr: readFileIfExists(laneResult.stderrPath),
        localOnly,
        limits: resolveEvidenceLimits(args),
      });
    }

    const manifest = writeQaManifest({ activity, laneResult, target, platform, notion });
    runs.push({ laneResult, notion, manifest, platform });
  }

  const finalResult = runs.every((run) => run.laneResult.exitCode === 0) ? 'passed' : 'failed';
  activity = updateActivity(activity, {
    template: 'qa-run',
    templateVersion: 2,
    latestQaRun: {
      targetName: target.name,
      baseAttemptId,
      lane: target.lane,
      result: finalResult,
      platforms: platforms.map((platform) => platform.id),
      runs: runs.map((run) => ({
        platform: run.platform.id,
        attemptId: run.laneResult.attemptId,
        result: run.laneResult.result,
        artifactDir: run.laneResult.artifactDir,
        command: run.laneResult.command,
        finishedAt: run.laneResult.finishedAt,
      })),
      git: runs.at(-1)?.laneResult.git ?? null,
      notionActivityPageId: activity.notionActivityPageId,
      notionActivityPageUrl: activity.notionActivityPageUrl,
      nextTarget: target.promoteTo ?? null,
      finishedAt: runs.at(-1)?.laneResult.finishedAt ?? new Date().toISOString(),
    },
  });

  if (!localOnly) {
    const ensured = await ensureQaRunNotionPage({ activity, localOnly });
    activity = ensured.activity;
  }

  printRunSummary({ activity, target, runs, finalResult, localOnly });
  process.exit(finalResult === 'passed' ? 0 : 1);
}

async function platformRunCommand() {
  const target = resolveTarget(args.target ?? args.feature ?? args.lane, args);
  const platforms = resolvePlatforms({ target, parsedArgs: args });
  if (platforms.length !== 1) throw new Error('platform-run requires exactly one --platform.');
  const platform = platforms[0];
  let { activity } = ensureQaActivity({
    activityId: args.activity,
    title: args.title,
    slug: args.slug,
  });
  const localOnly =
    args.localOnly === true || args.uploadNotion === 'false' || args.uploadNotion === false;
  if (!localOnly) {
    activity = await ensureLightweightEvidencePage({
      activity,
      reset: args.resetNotion === true,
      platforms,
    });
    await updatePlatformStatus({ activity, platform, status: 'Running' });
  }

  const attemptId = sanitizeName(
    args.attempt ?? `${target.name}-${platform.id}-${timestampAttempt()}`,
  );
  const laneResult = runPlatformTarget({ activity, target, platform, attemptId, options: args });
  const expectedCurrent = resolveExpectedCurrentReport({ laneResult, target });
  laneResult.expectedCurrentReport = expectedCurrent.report;
  laneResult.expectedCurrentReportPath = expectedCurrent.jsonPath;
  laneResult.expectedCurrentMarkdownPath = expectedCurrent.markdownPath;
  writeJson(laneResult.laneResultPath, laneResult);

  let notion = { skipped: localOnly };
  if (!localOnly) {
    notion = await publishPlatformEvidence({
      activity,
      platform,
      laneResult,
      expectedCurrentReport: expectedCurrent.report,
      coveragePath: args.coverage ?? defaultSettingsCoveragePath(activity.activityId),
      screenshotLimit: numericArg(args.screenshotLimit ?? args.screenshotUploadLimit, 1000),
    });
  }

  const manifest = writeQaManifest({ activity, laneResult, target, platform, notion });
  activity = updateActivity(activity, {
    template: 'qa-run',
    templateVersion: 2,
    latestQaRun: {
      targetName: target.name,
      baseAttemptId: attemptId,
      lane: target.lane,
      result: laneResult.result,
      platforms: [platform.id],
      runs: [
        {
          platform: platform.id,
          attemptId: laneResult.attemptId,
          result: laneResult.result,
          artifactDir: laneResult.artifactDir,
          command: laneResult.command,
          finishedAt: laneResult.finishedAt,
        },
      ],
      git: laneResult.git ?? null,
      notionActivityPageId: activity.notionActivityPageId,
      notionActivityPageUrl: activity.notionActivityPageUrl,
      nextTarget: target.promoteTo ?? null,
      finishedAt: laneResult.finishedAt ?? new Date().toISOString(),
    },
  });

  printRunSummary({
    activity,
    target,
    runs: [{ laneResult, notion, manifest, platform }],
    finalResult: laneResult.result,
    localOnly,
  });
  process.exit(laneResult.exitCode === 0 ? 0 : 1);
}

async function matrixRunCommand() {
  const target = resolveTarget(args.target ?? args.feature ?? args.lane, args);
  const platforms = resolvePlatforms({ target, parsedArgs: args });
  const concurrency = numericArg(args.concurrency, 3);
  const localOnly =
    args.localOnly === true || args.uploadNotion === 'false' || args.uploadNotion === false;
  const baseAttemptId = sanitizeName(
    args.attempt ?? `${target.name}-${args.matrix ?? 'matrix'}-${timestampAttempt()}`,
  );
  let { activity } = ensureQaActivity({
    activityId: args.activity,
    title: args.title,
    slug: args.slug,
  });
  if (!localOnly) {
    activity = await ensureLightweightEvidencePage({
      activity,
      reset: args.resetNotion === true,
      platforms,
    });
  }

  const startedAt = new Date().toISOString();
  const parallelPlatforms = platforms.filter(isParallelSafePlatform);
  const serialPlatforms = platforms.filter((platform) => !isParallelSafePlatform(platform));
  const runs = [
    ...(await runPlatformChildren({
      target,
      platforms: parallelPlatforms,
      baseAttemptId,
      concurrency,
      localOnly,
    })),
    ...(await runPlatformChildren({
      target,
      platforms: serialPlatforms,
      baseAttemptId,
      concurrency: 1,
      localOnly,
    })),
  ];
  const finalResult = runs.every((run) => run.exitCode === 0) ? 'passed' : 'failed';
  const matrixReport = {
    schemaVersion: 1,
    kind: 'qa-matrix-run-result',
    result: finalResult,
    activityId: activity.activityId,
    targetName: target.name,
    matrix: args.matrix ?? null,
    baseAttemptId,
    platforms: platforms.map((platform) => platform.id),
    concurrency,
    parallelPlatforms: parallelPlatforms.map((platform) => platform.id),
    serialPlatforms: serialPlatforms.map((platform) => platform.id),
    runs,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
  const paths = activityPaths(activity.activityId, baseAttemptId);
  writeJson(resolve(paths.attemptDir, 'matrix-result.json'), matrixReport);
  activity = updateActivity(activity, {
    template: 'qa-run',
    templateVersion: 2,
    latestQaRun: {
      targetName: target.name,
      baseAttemptId,
      lane: target.lane,
      result: finalResult,
      platforms: platforms.map((platform) => platform.id),
      runs: runs.map((run) => ({
        platform: run.platform,
        attemptId: run.attemptId,
        result: run.result,
        command: run.command,
        finishedAt: run.finishedAt,
      })),
      git: null,
      notionActivityPageId: activity.notionActivityPageId,
      notionActivityPageUrl: activity.notionActivityPageUrl,
      nextTarget: target.promoteTo ?? null,
      finishedAt: matrixReport.finishedAt,
    },
  });
  printMatrixSummary({ activity, target, runs, finalResult, localOnly });
  process.exit(finalResult === 'passed' ? 0 : 1);
}

async function platformPublishCommand() {
  const { activity } = readActivity(args.activity);
  const platform = resolveSinglePlatform(args.platform);
  const attemptId = String(args.attempt ?? '').trim();
  if (!attemptId) throw new Error('platform-publish requires --attempt.');
  const laneResult = readJsonIfExists(findLaneResultPath(activity.activityId, attemptId));
  if (!laneResult) throw new Error(`Could not read lane-result.json for ${attemptId}.`);
  const expectedCurrentReport = readJsonIfExists(laneResult.expectedCurrentReportPath);
  if (!expectedCurrentReport)
    throw new Error(`Could not read expected-current-report.json for ${attemptId}.`);
  const notion = await publishPlatformEvidence({
    activity,
    platform,
    laneResult,
    expectedCurrentReport,
    coveragePath: args.coverage ?? defaultSettingsCoveragePath(activity.activityId),
    screenshotLimit: numericArg(args.screenshotLimit ?? args.screenshotUploadLimit, 1000),
  });
  printJson(notion);
}

async function notionInitCommand() {
  let { activity } = ensureQaActivity({
    activityId: args.activity,
    title: args.title,
    slug: args.slug,
  });
  const platforms = splitArg(args.platform ?? args.platforms).map((platformId) =>
    resolveSinglePlatform(platformId),
  );
  activity = await ensureLightweightEvidencePage({
    activity,
    reset: args.reset === true || args.resetNotion === true,
    platforms,
  });
  printJson({
    result: 'passed',
    activityId: activity.activityId,
    notionActivityPageId: activity.notionActivityPageId,
    notionActivityPageUrl: activity.notionActivityPageUrl,
  });
}

async function gcCommand() {
  const execute = args.execute === true || args.dryRun === false;
  const activityIds = splitArg(args.activity ?? args.activities);
  const pageIds = splitArg(args.page ?? args.pages);
  const local = gcLocalArtifacts({
    activityIds,
    attempts: splitArg(args.deleteAttempt ?? args.deleteAttempts),
    paths: splitArg(args.deletePath ?? args.deletePaths),
    execute,
  });
  const notion = await gcNotionEvidence({
    activityIds:
      args.trashActivityPage === true
        ? activityIds
        : splitArg(args.trashActivity ?? args.trashActivities),
    pageIds,
    execute,
  });
  const report = {
    result: execute ? 'passed' : 'dry-run',
    execute,
    local,
    notion,
    backgroundProcesses: {
      action: 'manual-clear',
      note: 'Pi background-process registry is managed by the harness; run bg_process clear after confirming no active useful runs.',
    },
    createdAt: new Date().toISOString(),
  };
  const paths = activityPaths(
    activityIds[0] ?? 'qa-gc',
    args.gcAttempt ?? `gc-${timestampAttempt()}`,
  );
  writeJson(resolve(paths.attemptDir, 'gc-report.json'), report);
  printJson(report);
}

async function rerunCommand() {
  const { activity } = readActivity(args.activity);
  const latestTarget = activity.latestQaRun?.targetName;
  if (!latestTarget)
    throw new Error(`Activity ${activity.activityId} has no latestQaRun.targetName`);
  await runCommand({
    targetNameOverride: latestTarget,
    platformIdsOverride: activity.latestQaRun?.platforms,
  });
}

async function continueCommand() {
  const { activity } = readActivity(args.activity);
  const nextTarget = args.target ?? activity.latestQaRun?.nextTarget;
  if (!nextTarget)
    throw new Error(`Activity ${activity.activityId} has no next target. Pass --target.`);
  await runCommand({
    targetNameOverride: nextTarget,
    platformIdsOverride:
      args.platform || args.platforms || args.matrix ? null : activity.latestQaRun?.platforms,
  });
}

async function verifyCommand() {
  const { activity } = readActivity(args.activity);
  const ensured = await ensureQaRunNotionPage({
    activity,
    localOnly: args.localOnly === true || args.uploadNotion === 'false',
  });
  const verification = await verifyQaRunNotionPage({
    activity: ensured.activity,
    requireEvidence: args.requireEvidence !== 'false',
  });
  console.log(JSON.stringify(verification, null, 2));
  process.exit(verification.result === 'passed' ? 0 : 1);
}

async function contractCommand() {
  const coverage = buildSettingsContractCoverage({
    activityId: args.activity,
    attemptId: args.attempt,
    contractPath: args.contract,
    strictEvidence: args.strictEvidence === true || args.strictEvidence === 'true',
    strictSlots: args.strictSlots === true || args.strictSlots === 'true',
  });
  printContractSummary(coverage);
  process.exit(coverage.report.result === 'passed' ? 0 : 1);
}

function resolveExpectedCurrentReport({ laneResult, target }) {
  if (laneResult.expectedCurrentReportPath) {
    const report = readJsonIfExists(laneResult.expectedCurrentReportPath);
    if (report?.scenarios?.length) {
      return {
        report,
        jsonPath: laneResult.expectedCurrentReportPath,
        markdownPath: laneResult.expectedCurrentMarkdownPath ?? null,
      };
    }
  }
  return buildExpectedCurrentReport({ laneResult, target });
}

function writeQaManifest({ activity, laneResult, target, platform, notion }) {
  const paths = activityPaths(activity.activityId, laneResult.attemptId);
  const manifestPath = resolve(
    paths.attemptDir,
    `${platform.id}-${target.name}-qa-run-manifest.json`,
  );
  const manifest = {
    schemaVersion: 2,
    kind: 'e2e-qa-run-manifest',
    activity: {
      activityId: activity.activityId,
      activityUuid: activity.activityUuid,
      template: activity.template,
      templateVersion: activity.templateVersion,
      notionActivityPageId: activity.notionActivityPageId,
      notionActivityPageUrl: activity.notionActivityPageUrl,
    },
    target,
    platform,
    laneResult,
    notion,
    createdAt: new Date().toISOString(),
  };
  writeJson(manifestPath, manifest);
  writeJson(laneResult.laneResultPath, { ...laneResult, notion, manifestPath });
  return manifestPath;
}

function resolveTarget(targetName, parsedArgs) {
  const registry = loadTargets();
  const explicitSpecs = splitArg(parsedArgs.specs ?? parsedArgs.spec);
  const explicitGrep = parsedArgs.grep ? String(parsedArgs.grep) : null;
  const requestedName = aliasName(registry, targetName ?? parsedArgs.lane);

  if (requestedName && registry.targets?.[requestedName]) {
    return normalizeTarget(requestedName, registry.targets[requestedName], {
      registry,
      explicitSpecs,
      explicitGrep,
    });
  }
  if (requestedName && registry.lanes?.[requestedName]) {
    return normalizeTarget(requestedName, registry.lanes[requestedName], {
      registry,
      explicitSpecs,
      explicitGrep,
    });
  }
  if (explicitSpecs.length && parsedArgs.lane) {
    return normalizeTarget(
      aliasName(registry, parsedArgs.lane),
      { lane: aliasName(registry, parsedArgs.lane), specs: explicitSpecs },
      { registry, explicitSpecs, explicitGrep },
    );
  }

  throw new Error(
    `Unknown target/lane: ${targetName ?? parsedArgs.lane ?? '(missing)'}. Run: node e2e/qa/cli.mjs targets`,
  );
}

function normalizeTarget(name, target, { registry, explicitSpecs, explicitGrep }) {
  const lane = aliasName(registry, target.lane ?? name);
  const specs = explicitSpecs.length ? explicitSpecs : splitArg(target.specs);
  if (!specs.length) throw new Error(`Target ${name} has no specs.`);
  return {
    name,
    lane,
    runLevel: target.runLevel ?? (target.grep || explicitGrep ? 'scenario' : 'feature'),
    specs,
    grep: explicitGrep ?? target.grep ?? null,
    description: target.description ?? '',
    defaultExpectedOutcome: target.defaultExpectedOutcome ?? null,
    expectedOutcomes: target.expectedOutcomes ?? null,
    platform: target.platform ?? null,
    platforms: target.platforms ?? null,
    matrix: target.matrix ?? null,
    promoteTo: aliasName(registry, target.promoteTo) ?? null,
  };
}

function resolvePlatforms({ target, parsedArgs, platformIdsOverride }) {
  const platformRegistry = loadPlatforms();
  const matrixRegistry = loadMatrices();
  const matrixName = parsedArgs.matrix ?? target.matrix;
  const platformIds = matrixName
    ? platformsForMatrix(matrixRegistry, matrixName)
    : splitArg(
        parsedArgs.platform ??
          parsedArgs.platforms ??
          platformIdsOverride ??
          target.platforms ??
          target.platform,
      );
  const ids = platformIds.length
    ? platformIds
    : [target.platform ?? platformRegistry.defaultPlatform ?? 'web-chromium'];

  return ids.map((id) => {
    const platform = platformRegistry.platforms?.[id];
    if (!platform) throw new Error(`Unknown platform ${id}. Run: node e2e/qa/cli.mjs platforms`);
    return platform;
  });
}

function platformsForMatrix(registry, matrixName) {
  const matrix = registry.matrices?.[matrixName];
  if (!matrix) throw new Error(`Unknown matrix ${matrixName}. Run: node e2e/qa/cli.mjs matrices`);
  if (matrix.enabled === false)
    throw new Error(`Matrix ${matrixName} is disabled: ${matrix.description}`);
  return matrix.platforms ?? [];
}

function aliasName(registry, name) {
  if (!name) return null;
  return registry.aliases?.[name] ?? name;
}

function loadTargets() {
  const base = readJsonIfExists(targetsPath) ?? { targets: {}, lanes: {}, aliases: {} };
  const registryFiles = [
    ...findFiles(featureRegistryRoot, (name) => name.endsWith('.json')).sort(),
    adHocRegistryPath,
    debugTargetsRegistryPath,
  ];
  return registryFiles.reduce(
    (registry, registryPath) => mergeTargetRegistry(registry, readJsonIfExists(registryPath)),
    base,
  );
}

function mergeTargetRegistry(base, extension) {
  if (!extension) return base;
  return {
    ...base,
    aliases: { ...(base.aliases ?? {}), ...(extension.aliases ?? {}) },
    lanes: { ...(base.lanes ?? {}), ...(extension.lanes ?? {}) },
    targets: { ...(base.targets ?? {}), ...(extension.targets ?? {}) },
  };
}

function loadPlatforms() {
  return readJsonIfExists(platformsPath) ?? { defaultPlatform: 'web-chromium', platforms: {} };
}

function loadMatrices() {
  return readJsonIfExists(matricesPath) ?? { matrices: {} };
}

async function runPlatformChildren({ target, platforms, baseAttemptId, concurrency, localOnly }) {
  const queue = [...platforms];
  const results = [];
  const workerCount = Math.min(Math.max(1, concurrency), Math.max(1, queue.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length) {
        const platform = queue.shift();
        if (!platform) return;
        results.push(
          await runPlatformChild({
            target,
            platform,
            attemptId: `${baseAttemptId}-${platform.id}`,
            localOnly,
          }),
        );
      }
    }),
  );
  return results
    .sort(
      (left, right) => platforms.indexOf(left.platformRef) - platforms.indexOf(right.platformRef),
    )
    .map(({ platformRef: _platformRef, ...result }) => result);
}

function runPlatformChild({ target, platform, attemptId, localOnly }) {
  const commandArgs = [
    fileURLToPath(import.meta.url),
    'platform-run',
    '--activity',
    args.activity,
    '--target',
    target.name,
    '--platform',
    platform.id,
    '--attempt',
    attemptId,
    ...forwardOptionalArgs(matrixForwardKeys()),
    ...(localOnly ? ['--local-only'] : []),
  ];
  const command = `${process.execPath} ${commandArgs.map(shellQuote).join(' ')}`;
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, commandArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('close', (exitCode, signal) => {
      resolveRun({
        platform: platform.id,
        platformRef: platform,
        attemptId,
        result: exitCode === 0 ? 'passed' : 'failed',
        exitCode,
        signal,
        command,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtMs,
      });
    });
  });
}

function isParallelSafePlatform(platform) {
  return platform.adapter === 'playwright';
}

function matrixForwardKeys() {
  return [
    'coverage',
    'screenshotLimit',
    'screenshotUploadLimit',
    'grep',
    'specs',
    'spec',
    'project',
    'nativeCommand',
    'command',
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
}

function forwardOptionalArgs(keys) {
  return keys.flatMap((key) => {
    const value = args[key];
    if (value === undefined || value === null || value === false) return [];
    const flag = `--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
    return value === true ? [flag] : [flag, String(value)];
  });
}

function shellQuote(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:=@-]+$/.test(text) ? text : JSON.stringify(text);
}

function resolveSinglePlatform(platformId) {
  if (!platformId) throw new Error('--platform is required.');
  const platform = loadPlatforms().platforms?.[platformId];
  if (!platform)
    throw new Error(`Unknown platform ${platformId}. Run: node e2e/qa/cli.mjs platforms`);
  return platform;
}

function findLaneResultPath(activityId, attemptId) {
  const paths = activityPaths(activityId, attemptId);
  const direct = findFiles(paths.attemptDir, (name) => name === 'lane-result.json')[0];
  if (direct) return direct;
  return resolve(
    paths.attemptDir,
    'testing',
    String(args.platform ?? ''),
    String(args.target ?? ''),
    'lane-result.json',
  );
}

function defaultSettingsCoveragePath(activityId) {
  const attempts = findFiles(
    activityPaths(activityId).activityDir,
    (name) => name === 'settings-contract-coverage.json',
  );
  return (
    attempts.sort((left, right) => statSync(left).mtimeMs - statSync(right).mtimeMs).at(-1) ?? null
  );
}

function gcLocalArtifacts({ activityIds, attempts, paths, execute }) {
  const roots = activityIds.length ? activityIds : ['qa-gc'];
  const attemptPaths = roots.flatMap((activityId) =>
    attempts.map((attemptId) => activityPaths(activityId, attemptId).attemptDir),
  );
  const candidates = [...attemptPaths, ...paths].map((candidate) => resolve(candidate));
  return candidates.map((candidate) => {
    assertSafeGcPath(candidate, roots[0]);
    const exists = existsSync(candidate);
    if (execute && exists) rmSync(candidate, { recursive: true, force: true });
    return {
      path: candidate,
      existed: exists,
      action: execute ? (exists ? 'deleted' : 'missing') : exists ? 'would-delete' : 'missing',
    };
  });
}

function assertSafeGcPath(candidate, activityId) {
  const artifactRoot = activityPaths(activityId).artifactRoot;
  const tempRoot = resolve('/tmp');
  if (candidate === artifactRoot || candidate === tempRoot) {
    throw new Error(`Refusing to delete GC root: ${candidate}`);
  }
  if (!candidate.startsWith(`${artifactRoot}/`) && !candidate.startsWith(`${tempRoot}/`)) {
    throw new Error(`Refusing to delete path outside artifact root or /tmp: ${candidate}`);
  }
}

function splitArg(value) {
  if (!value) return [];
  return Array.isArray(value)
    ? value
    : String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function resolveEvidenceLimits(parsedArgs) {
  return {
    screenshots: numericArg(parsedArgs.screenshotLimit ?? parsedArgs.screenshotUploadLimit, 1000),
    traces: numericArg(parsedArgs.traceLimit ?? parsedArgs.traceUploadLimit, 4),
    videos: numericArg(parsedArgs.videoLimit ?? parsedArgs.videoUploadLimit, 4),
  };
}

function numericArg(value, fallback) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function readFileIfExists(path) {
  if (!path || !existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

function printContractSummary({ report, jsonPath, markdownPath }) {
  const lines = [
    'Settings contract coverage',
    `├─ Result: ${report.result}`,
    `├─ Activity: ${report.activityId}`,
    `├─ Attempt: ${report.attemptId}`,
    `├─ Scenarios: ${report.summary.scenarios}`,
    `├─ Required cells: ${report.summary.required.total}`,
    `├─ Matched required cells: ${report.summary.required.matched}`,
    `├─ Open required cells: ${report.summary.required.open}`,
    `├─ Strict evidence: ${report.strictEvidence ? 'enabled' : 'disabled'}`,
    `├─ Strict slots: ${report.strictSlots ? 'enabled' : 'disabled'}`,
    `├─ Visual proof explicit denies: ${report.summary.required.visualProof.explicitDeny.cells} cells, ${report.summary.required.visualProof.explicitDeny.findings} findings`,
    `├─ Visual proof advisories: ${report.summary.required.visualProof.advisory.cells} cells, ${report.summary.required.visualProof.advisory.findings} findings`,
    '├─ Visual proof policy: explicit deny blocks; advisory proceeds unless open-slot/reviewer-challenged',
    `├─ Slot gaps: ${report.summary.required.slotEvidence.cellsWithMissingSlots} cells, ${report.summary.required.slotEvidence.counts.missingRequired} required slots`,
    `├─ Missing start slots: ${report.summary.required.slotEvidence.counts.missingStart}`,
    `├─ Missing terminal slots: ${report.summary.required.slotEvidence.counts.missingTerminal}`,
    `├─ JSON: ${shortPath(jsonPath)}`,
    `└─ Markdown: ${shortPath(markdownPath)}`,
  ];
  console.log(lines.join('\n'));
}

function printRunSummary({ activity, target, runs, finalResult, localOnly }) {
  const first = runs[0];
  const lines = [
    'E2E QA run',
    `├─ Result: ${finalResult}`,
    `├─ Activity: ${activity.activityId}`,
    `├─ Target: ${target.name}`,
    `├─ Platforms: ${runs.map((run) => run.platform.id).join(', ')}`,
    `├─ Commands: ${runs.length}`,
    `├─ Artifacts: ${runs.map((run) => shortPath(run.laneResult.artifactDir)).join(' | ')}`,
    `├─ Screenshots: ${runs.reduce((total, run) => total + run.laneResult.screenshotCount, 0)}`,
    `├─ Manifest: ${first?.manifest ?? 'none'}`,
    `├─ Notion: ${localOnly ? 'skipped' : (activity.notionActivityPageUrl ?? 'unavailable')}`,
    `└─ Next: ${target.promoteTo ? `run ${target.promoteTo}` : 'review evidence'}`,
  ];
  console.log(lines.join('\n'));
}

function printMatrixSummary({ activity, target, runs, finalResult, localOnly }) {
  const lines = [
    'E2E QA matrix run',
    `├─ Result: ${finalResult}`,
    `├─ Activity: ${activity.activityId}`,
    `├─ Target: ${target.name}`,
    `├─ Platforms: ${runs.map((run) => run.platform).join(', ')}`,
    `├─ Passed: ${runs.filter((run) => run.exitCode === 0).length}`,
    `├─ Failed: ${runs.filter((run) => run.exitCode !== 0).length}`,
    `├─ Notion: ${localOnly ? 'skipped' : (activity.notionActivityPageUrl ?? 'unavailable')}`,
    `└─ Next: ${target.promoteTo ? `run ${target.promoteTo}` : 'review evidence'}`,
  ];
  console.log(lines.join('\n'));
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp() {
  console.log(`E2E QA runner

Usage:
  node e2e/qa/cli.mjs run --activity ACT-031 --target act-026-reader-failures
  node e2e/qa/cli.mjs run --activity ACT-031 --target reader-settings-panels --platform web-webkit
  node e2e/qa/cli.mjs run --activity ACT-031 --target act-026-reader-failures --matrix all-web
  node e2e/qa/cli.mjs run --activity ACT-031 --lane reader
  node e2e/qa/cli.mjs platform-run --activity ACT-093 --target settings --platform web-chromium
  node e2e/qa/cli.mjs matrix-run --activity ACT-093 --target settings --matrix playwright-all --concurrency 3
  node e2e/qa/cli.mjs platform-publish --activity ACT-093 --attempt settings-web-chromium-20260514 --platform web-chromium
  node e2e/qa/cli.mjs notion-init --activity ACT-093 --platform web-chromium
  node e2e/qa/cli.mjs gc --activity ACT-093 --execute
  node e2e/qa/cli.mjs rerun --activity ACT-031
  node e2e/qa/cli.mjs continue --activity ACT-031
  node e2e/qa/cli.mjs verify --activity ACT-031
  node e2e/qa/cli.mjs contract --activity ACT-093
  node e2e/qa/cli.mjs contract --activity ACT-093 --strict-evidence --strict-slots
  node e2e/qa/cli.mjs targets
  node e2e/qa/cli.mjs platforms
  node e2e/qa/cli.mjs matrices

Options:
  --target <name>                Named target from e2e/qa/targets.json
  --lane <name>                  Generic lane from e2e/qa/targets.json; chromium-* aliases still work
  --platform <id[,id]>           Platform(s) from e2e/qa/registry/platforms.json
  --matrix <name>                Matrix from e2e/qa/registry/matrices.json
  --specs <a,b>                  Override spec list
  --grep <pattern>               Override grep pattern
  --attempt <id>                 Override attempt id
  --local-only                   Skip Notion and only write local artifacts
  --reset-notion                 Recreate the lightweight evidence page for notion-init/platform-run
  --execute                      Execute gc changes; without it gc is a dry run
  --concurrency <n>              matrix-run parallelism for Playwright-safe platforms; native/Tauri stay serial
  --delete-attempts <ids>        GC local attempt artifact directories for the selected activity
  --delete-paths <paths>         GC explicit safe local paths under artifact root or /tmp
  --page <ids>                   GC explicit Notion page IDs by moving them to Trash
  --trash-activity-page          Also move the selected activity's current Notion page to Trash
  --coverage <path>              Optional settings-contract-coverage.json for cell counts
  --screenshot-limit <n>         Scenario screenshot upload cap, default 1000
  --trace-limit <n>              Trace upload cap, default 4
  --video-limit <n>              Video upload cap, default 4
  --contract <path>              Contract source for contract audits
  --strict-evidence              Reject fixture-overlay/provisional evidence modes
  --strict-slots                 Require exact contract screenshot slot names per SET/platform
                                 Visual proof alarms always run for QA contract coverage
`);
}
