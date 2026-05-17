import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export const APP_ROOT = resolve(new URL('../../..', import.meta.url).pathname);
export const REPO_ROOT = resolve(APP_ROOT, '../..');

export function parseArgs(argv) {
  const parsed = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      parsed._.push(arg);
      continue;
    }

    const equalsIndex = arg.indexOf('=');
    const rawKey = equalsIndex === -1 ? arg.slice(2) : arg.slice(2, equalsIndex);
    const inlineValue = equalsIndex === -1 ? undefined : arg.slice(equalsIndex + 1);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[index + 1];

    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
    } else if (next && !next.startsWith('--')) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = true;
    }
  }

  return parsed;
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, data) {
  ensureDir(resolve(path, '..'));
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

export function loadEnvFiles() {
  const candidates = [
    resolve(homedir(), '.openread-dev/.env'),
    resolve(APP_ROOT, '.env.local'),
    resolve(APP_ROOT, '.env.web'),
    resolve(APP_ROOT, '.env.test.local'),
    resolve(APP_ROOT, '.env'),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const index = trimmed.indexOf('=');
      const key = trimmed.slice(0, index).trim();
      const value = trimmed
        .slice(index + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }

  process.env.NEXT_PUBLIC_APP_PLATFORM = process.env.NEXT_PUBLIC_APP_PLATFORM ?? 'web';
}

export function activityPaths(activityId, attemptId = timestampAttempt()) {
  const artifactRoot = resolve(
    process.env.OPENREAD_ACTIVITY_ARTIFACT_ROOT ??
      resolve(homedir(), '.openread-dev/activity-artifacts'),
  );
  const activityDir = resolve(artifactRoot, sanitizeName(activityId));
  const attemptDir = resolve(activityDir, sanitizeName(attemptId));
  return {
    artifactRoot,
    activityId: sanitizeName(activityId),
    activityDir,
    activityPath: resolve(activityDir, 'activity.json'),
    registryPath: resolve(artifactRoot, 'activity-registry.json'),
    attemptId: sanitizeName(attemptId),
    attemptDir,
  };
}

export function ensureQaActivity({ activityId, title, slug, template = 'qa-run' }) {
  if (!activityId) throw new Error('--activity is required');
  const paths = activityPaths(activityId);
  const existing = readJsonIfExists(paths.activityPath);

  if (existing?.template && existing.template !== template) {
    throw new Error(
      `Activity ${activityId} uses template ${existing.template}; E2E QA requires ${template}. Create a QA activity or pass a matching activity.`,
    );
  }

  const now = new Date().toISOString();
  const activity = {
    schemaVersion: 1,
    activityId: paths.activityId,
    activityUuid: existing?.activityUuid ?? randomUUID(),
    title: title ?? existing?.title ?? paths.activityId,
    slug: slug ?? existing?.slug ?? sanitizeSlug(title ?? paths.activityId),
    template,
    templateVersion: 2,
    status: existing?.status ?? 'planned',
    currentStage: existing?.currentStage ?? 'validation',
    approvalStatus: existing?.approvalStatus ?? 'not-needed',
    artifactDir: paths.activityDir,
    notionActivityPageId: existing?.notionActivityPageId ?? null,
    notionActivityPageUrl: existing?.notionActivityPageUrl ?? null,
    latestQaRun: existing?.latestQaRun ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  ensureDir(paths.activityDir);
  writeJson(paths.activityPath, activity);
  updateRegistry(paths, activity);
  return { activity, paths };
}

export function updateActivity(activity, patch) {
  const paths = activityPaths(activity.activityId);
  const next = { ...activity, ...patch, updatedAt: new Date().toISOString() };
  writeJson(paths.activityPath, next);
  updateRegistry(paths, next);
  return next;
}

export function readActivity(activityId) {
  const paths = activityPaths(activityId);
  const activity = readJsonIfExists(paths.activityPath);
  if (!activity) throw new Error(`Activity not found: ${activityId}`);
  return { activity, paths };
}

export function timestampAttempt(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function sanitizeName(value) {
  return String(value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function sanitizeSlug(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function slugLabel(value) {
  return sanitizeSlug(value).slice(0, 100) || 'item';
}

export function gitSummary() {
  return {
    branch: runGit(['branch', '--show-current']),
    commit: runGit(['rev-parse', 'HEAD']),
    status: runGit(['status', '--short']),
  };
}

export function runGit(args) {
  const result = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function findFiles(dir, predicate) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return findFiles(path, predicate);
    return entry.isFile() && predicate(entry.name) ? [path] : [];
  });
}

export function redact(value) {
  return String(value ?? '')
    .replace(/orsk-[A-Za-z0-9_-]+/g, 'orsk-REDACTED')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer REDACTED')
    .replace(
      /("?(?:token|refresh_token|access_token|password|secret|key)"?\s*[:=]\s*")([^"\n]+)(")/gi,
      '$1REDACTED$3',
    );
}

export function shortPath(path) {
  return path.replace(`${APP_ROOT}/`, '');
}

export function evidenceFilename(filePath) {
  const ext = basename(filePath).includes('.') ? `.${basename(filePath).split('.').pop()}` : '';
  return `${slugLabel(basename(resolve(filePath, '..'))).slice(0, 90)}${ext || '.artifact'}`;
}

function updateRegistry(paths, activity) {
  const registry = readJsonIfExists(paths.registryPath) ?? { schemaVersion: 1, activities: [] };
  writeJson(paths.registryPath, {
    ...registry,
    activities: [
      ...(registry.activities ?? []).filter((entry) => entry.activityId !== activity.activityId),
      {
        activityId: activity.activityId,
        activityUuid: activity.activityUuid,
        title: activity.title,
        slug: activity.slug,
        template: activity.template,
        artifactDir: activity.artifactDir,
        notionActivityPageId: activity.notionActivityPageId ?? null,
        notionActivityPageUrl: activity.notionActivityPageUrl ?? null,
        createdAt: activity.createdAt,
      },
    ].sort((a, b) => a.activityId.localeCompare(b.activityId)),
  });
}
