import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  appendQaRunTrackerEntry,
  classifyScenario,
  qaRunTrackerEnabled,
} from './qa-run-tracker.mjs';

class QaRunTrackerReporter {
  constructor() {
    this.notionToken = process.env.NOTION_TOKEN ?? process.env.NOTION_API_KEY;
    this.pageId = process.env.OPENREAD_QA_TRACKER_PAGE_ID;
    this.platformSection = process.env.OPENREAD_QA_TRACKER_SECTION_PATH ?? 'Chromium';
    this.enabled =
      process.env.OPENREAD_QA_TRACKER_ENABLED === 'true' &&
      qaRunTrackerEnabled({ notionToken: this.notionToken, pageId: this.pageId });
    this.activityId = process.env.OPENREAD_ACTIVITY_ID;
    this.runId = process.env.OPENREAD_QA_RUN_ID;
    this.lane = process.env.OPENREAD_QA_LANE;
    this.runLevel = process.env.OPENREAD_QA_RUN_LEVEL;
    this.fallbackFeature = process.env.OPENREAD_QA_FEATURE;
    this.fallbackManualCase = process.env.OPENREAD_QA_MANUAL_CASE;
    this.incrementalEvidence = process.env.OPENREAD_QA_INCREMENTAL_EVIDENCE === 'true';
    this.scenarioResults = new Map();
    this.operationChain = Promise.resolve();
  }

  onTestEnd(test, result) {
    if (!this.enabled) return;

    const scenario = readableScenarioTitle(test);
    const spec = relativeSpec(test.location?.file);
    const classification = classifyScenario({
      file: spec,
      title: scenario,
      fallbackFeature: this.fallbackFeature,
      fallbackManualCase: this.fallbackManualCase,
    });
    const status = normalizeStatus(result.status);
    this.recordScenarioResult({ spec, scenario, status, retry: result.retry });

    if (!isTerminalAttempt(test, result)) return;

    const terminalStatus = finalScenarioStatus(test, result);
    const artifacts = artifactFiles(test.results ?? [result]);
    const sectionPath = testSectionPath(this.platformSection, classification.feature, scenario);
    const entry = {
      event: 'scenario-status',
      status: terminalStatus,
      feature: classification.feature,
      manualCase: classification.manualCase,
      scenario,
      spec,
      retry: maxRetry(test.results ?? [result]),
      durationMs: totalDuration(test.results ?? [result]),
      screenshots: artifacts.screenshots.length,
      videos: artifacts.videos.length,
      traces: artifacts.traces.length,
      note: failureNoteForStatus(terminalStatus, test.results ?? [result]),
    };

    this.enqueue(`scenario-status:${scenario}`, async () => {
      await this.append(entry, sectionPath);

      if (this.incrementalEvidence) {
        await this.uploadEvidence({ sectionPath, scenario, status: terminalStatus, artifacts });
      }
    });
  }

  async onEnd() {
    if (!this.enabled) return;
    await this.flushOperations();
  }

  async onExit() {
    if (!this.enabled) return;
    await this.flushOperations();
  }

  recordScenarioResult({ spec, scenario, status, retry }) {
    const key = `${spec ?? ''}::${scenario}`;
    const previous = this.scenarioResults.get(key);
    const previousRetry = Number.isFinite(previous?.retry) ? previous.retry : -1;
    const hasFailedAttempt = Boolean(previous?.hasFailedAttempt) || isFailedStatus(status);
    if (!previous || retry >= previousRetry) {
      this.scenarioResults.set(key, { status, retry, hasFailedAttempt });
      return;
    }
    previous.hasFailedAttempt = hasFailedAttempt;
  }

  async uploadEvidence({ sectionPath, scenario, status, artifacts }) {
    const evidencePath = `${sectionPath}/Evidence`;
    await this.uploadArtifactGroup({
      label: 'test-screenshots',
      files: artifacts.screenshots,
      sectionPath: evidencePath,
      heading: `${status}: ${scenario} screenshots`,
      layout: artifacts.screenshots.length > 1 ? 'columns' : 'single',
    });
    if (isFailedStatus(status)) {
      await this.uploadArtifactGroup({
        label: 'test-videos',
        files: artifacts.videos,
        sectionPath: evidencePath,
        heading: `${status}: ${scenario} videos`,
        layout: 'single',
      });
    }
  }

  async uploadArtifactGroup({ label, files, sectionPath, heading, layout }) {
    if (!files.length) return;
    const upload = spawnSync(
      'node',
      [
        'scripts/activity/notion-upload-file.mjs',
        '--activity',
        String(this.activityId),
        '--attempt',
        String(this.runId),
        '--page',
        String(this.pageId),
        '--files',
        files.join(','),
        '--layout',
        layout,
        '--section-path',
        sectionPath,
        '--heading',
        heading,
        '--caption',
        files.map((file) => basename(file)).join('|'),
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: 'utf8',
        stdio: 'pipe',
        maxBuffer: 20 * 1024 * 1024,
      },
    );
    const exitCode = upload.status ?? (upload.signal ? 1 : 0);
    if (exitCode !== 0) {
      console.error(
        `QA Run Tracker ${label} upload failed: ${redact(upload.stderr || upload.stdout).slice(-500)}`,
      );
    }
  }

  enqueue(label, operation) {
    // Playwright does not await async onTestEnd hooks, so queue Notion writes
    // and flush them from awaited lifecycle hooks before the reporter process exits.
    this.operationChain = this.operationChain
      .catch(() => {})
      .then(async () => {
        try {
          await operation();
        } catch (error) {
          // Never fail Playwright because the lightweight Notion tracker failed.
          console.error(`QA Run Tracker ${label} failed: ${error.message}`);
        }
      });
  }

  async flushOperations() {
    await this.operationChain;
  }

  async append(entry, sectionPath) {
    try {
      await appendQaRunTrackerEntry({
        notionToken: this.notionToken,
        pageId: this.pageId,
        sectionPath,
        entry: {
          activityId: this.activityId,
          runId: this.runId,
          lane: this.lane,
          runLevel: this.runLevel,
          ...entry,
        },
      });
    } catch (error) {
      // Never fail Playwright because the lightweight Notion tracker failed.
      console.error(`QA Run Tracker append failed: ${error.message}`);
    }
  }
}

function readableScenarioTitle(test) {
  return test.title;
}

function testSectionPath(platformSection, feature, scenario) {
  return [platformSection, feature, scenario].map(notionPathPart).join('/');
}

function notionPathPart(value) {
  return String(value ?? '')
    .replaceAll('/', '／')
    .trim()
    .slice(0, 120);
}

function isTerminalAttempt(test, result) {
  if (['passed', 'skipped'].includes(result.status)) return true;
  return Number.isFinite(result.retry) && result.retry >= test.retries;
}

function finalScenarioStatus(test, result) {
  if (result.status === 'skipped') return 'skipped';
  if (result.status === 'passed') {
    const outcome = typeof test.outcome === 'function' ? test.outcome() : null;
    const hasFailedAttempt = (test.results ?? []).some((testResult) =>
      ['failed', 'timedOut', 'interrupted'].includes(testResult.status),
    );
    return outcome === 'flaky' || hasFailedAttempt ? 'flaky' : 'passed';
  }
  return normalizeStatus(result.status);
}

function artifactFiles(results) {
  const files = (results ?? [])
    .flatMap((result) => result.attachments ?? [])
    .filter((attachment) => attachment.path && existsSync(attachment.path));
  return {
    screenshots: uniqueFiles(
      files.filter((file) => file.contentType?.startsWith('image/')).map((file) => file.path),
    ),
    videos: uniqueFiles(
      files.filter((file) => file.contentType?.startsWith('video/')).map((file) => file.path),
    ),
    traces: uniqueFiles(files.filter((file) => file.name === 'trace').map((file) => file.path)),
  };
}

function uniqueFiles(files) {
  return [...new Set(files.filter(Boolean))];
}

function maxRetry(results) {
  const retries = (results ?? []).map((result) => result.retry).filter(Number.isFinite);
  return retries.length > 0 ? Math.max(...retries) : null;
}

function totalDuration(results) {
  const duration = (results ?? []).reduce(
    (total, result) => total + (Number.isFinite(result.duration) ? result.duration : 0),
    0,
  );
  return duration > 0 ? duration : null;
}

function failureNoteForStatus(status, results) {
  if (!isFailedStatus(status)) return status === 'flaky' ? 'passed on retry' : null;
  const failed = [...(results ?? [])]
    .reverse()
    .find((result) => ['failed', 'timedOut', 'interrupted'].includes(result.status));
  const message = failed?.error?.message ?? failed?.errors?.[0]?.message;
  if (!message) return null;
  return stripAnsi(message).split('\n').filter(Boolean)[0]?.slice(0, 180) ?? null;
}

function isFailedStatus(status) {
  return ['failed', 'timed-out', 'interrupted'].includes(status);
}

function normalizeStatus(status) {
  if (status === 'passed') return 'passed';
  if (status === 'skipped') return 'skipped';
  if (status === 'timedOut') return 'timed-out';
  if (status === 'interrupted') return 'interrupted';
  return 'failed';
}

function stripAnsi(value) {
  return String(value ?? '').replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

function redact(value) {
  return String(value ?? '')
    .replace(/orsk-[A-Za-z0-9_-]+/g, 'orsk-REDACTED')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer REDACTED')
    .replace(
      /("?(?:token|refresh_token|access_token|password|secret|key)"?\s*[:=]\s*")([^"\n]+)(")/gi,
      '$1REDACTED$3',
    );
}

function relativeSpec(file) {
  if (!file) return null;
  const normalized = file.replaceAll('\\', '/');
  const marker = '/apps/openread-app/';
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex !== -1) return normalized.slice(markerIndex + marker.length);
  const e2eIndex = normalized.indexOf('/e2e/');
  if (e2eIndex !== -1) return normalized.slice(e2eIndex + 1);
  return normalized.split('/').slice(-3).join('/');
}

export default QaRunTrackerReporter;
