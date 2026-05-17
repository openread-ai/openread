import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  APP_ROOT,
  activityPaths,
  ensureDir,
  findFiles,
  gitSummary,
  redact,
  sanitizeName,
  writeJson,
} from '../lib/common.mjs';

export function runPlaywrightTarget({ activity, target, platform, attemptId, options = {} }) {
  const paths = activityPaths(activity.activityId, attemptId);
  const platformDir = sanitizeName(platform.id);
  const targetDir = sanitizeName(target.name);
  const artifactDir = resolve(paths.attemptDir, 'testing', platformDir, targetDir);
  const outputDir = resolve(artifactDir, 'playwright-output');
  const resultPath = resolve(artifactDir, 'playwright-results.json');
  const stdoutPath = resolve(artifactDir, 'stdout.log');
  const stderrPath = resolve(artifactDir, 'stderr.log');
  const laneResultPath = resolve(artifactDir, 'lane-result.json');
  const manifestPath = resolve(
    paths.attemptDir,
    `${platformDir}-${targetDir}-qa-run-manifest.json`,
  );
  ensureDir(outputDir);

  const project = options.project ?? platform.project;
  const command = [
    'pnpm',
    'exec',
    'playwright',
    'test',
    `--project=${project}`,
    '--reporter=line,json',
    `--output=${outputDir}`,
    ...(target.grep ? ['--grep', target.grep] : []),
    ...target.specs,
  ];

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const git = gitSummary();
  const run = spawnSync('corepack', command, {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      NEXT_PUBLIC_APP_PLATFORM: platform.appPlatform ?? 'web',
      OPENREAD_PLAYWRIGHT_SCREENSHOT: process.env.OPENREAD_PLAYWRIGHT_SCREENSHOT ?? 'on',
      OPENREAD_PLAYWRIGHT_VIDEO: resolveVideoMode(options.video ?? options.videoMode),
      PLAYWRIGHT_JSON_OUTPUT_NAME: resultPath,
      PLAYWRIGHT_HTML_OPEN: 'never',
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

  const screenshots = findFiles(outputDir, (name) => name.endsWith('.png'));
  const traces = findFiles(outputDir, (name) => name.endsWith('.zip'));
  const videos = findFiles(outputDir, (name) => name.endsWith('.webm'));
  const exitCode = run.status ?? (run.signal ? 1 : 0);
  const finishedAt = new Date().toISOString();
  const laneResult = {
    schemaVersion: 1,
    stage: 'e2e-qa-run',
    result: exitCode === 0 ? 'passed' : 'failed',
    activityId: activity.activityId,
    activityUuid: activity.activityUuid,
    attemptId,
    targetName: target.name,
    lane: target.lane,
    runLevel: target.runLevel,
    platform,
    adapter: 'playwright',
    project,
    command: `corepack ${command.join(' ')}`,
    specs: target.specs,
    grep: target.grep ?? null,
    git,
    artifactDir,
    outputDir,
    playwrightResultsPath: existsSync(resultPath) ? resultPath : null,
    stdoutPath,
    stderrPath,
    laneResultPath,
    manifestPath,
    screenshots,
    screenshotCount: screenshots.length,
    traces,
    traceCount: traces.length,
    videos,
    videoCount: videos.length,
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

function resolveVideoMode(value) {
  const allowed = new Set(['off', 'on', 'retain-on-failure', 'on-first-retry']);
  const mode = String(value ?? process.env.OPENREAD_PLAYWRIGHT_VIDEO ?? 'retain-on-failure');
  return allowed.has(mode) ? mode : 'retain-on-failure';
}
