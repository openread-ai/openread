// App-level Playwright config — covers the 6 supported web-layer targets
// (web · mac · windows · ios · ipados · android) via 6 projects
// plus a ui-regression lane. Snapshots land in the local artifact bucket
// so baselines stay out of the repo.
//
// `workers: 1` + extended timeouts are deliberate: specs share a single
// Supabase test user, so parallel runs would trip the per-account rate
// limit. Mirrors dev's proven settings.

import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';
import { assertPlaywrightNodeRuntime } from './e2e/helpers/runtime';

const rootPackage = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
  engines?: { node?: string };
};
const expectedNodeRange = rootPackage.engines?.node;
if (!expectedNodeRange) throw new Error('PLAYWRIGHT_NODE_RUNTIME_CONFIG_MISSING');
assertPlaywrightNodeRuntime(process.versions.node, expectedNodeRange);

// Load env files into process.env for the test RUNNER (test-users.ts's
// requireEnv, auth.ts's Supabase client). Order = precedence: earlier
// files win. The Next.js dev server spawned by `pnpm dev-web` loads
// .env.web + .env.local itself — this block is solely for the Node
// process that runs Playwright.
//
// We parse manually to avoid pulling a dotenv dep — these are flat
// KEY=VALUE files.
for (const file of ['.env.test.local', '.env.local', '.env']) {
  const p = resolve(__dirname, file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

const BUCKET = process.env.OPENREAD_BUCKET_DIR ?? resolve(homedir(), '.openread-dev/artifacts');
const isLiveAiEvalRun = process.env.LIVE_AI_EVALS === '1';
const liveAiEvalBaseURL = isLiveAiEvalRun ? process.env.AI_EVAL_BASE_URL : undefined;
const configuredBaseURL = liveAiEvalBaseURL ?? 'http://localhost:3000';
const shouldStartWebServer = !liveAiEvalBaseURL;
const isStorageLifecycleRun = process.env.OPENREAD_E2E_STORAGE_LIFECYCLE_LIVE === '1';
const screenshotMode =
  process.env.OPENREAD_PLAYWRIGHT_SCREENSHOT === 'on' ? 'on' : 'only-on-failure';

const videoModes = ['off', 'on', 'retain-on-failure', 'on-first-retry'] as const;
type VideoMode = (typeof videoModes)[number];
const videoMode: VideoMode = videoModes.includes(process.env.OPENREAD_PLAYWRIGHT_VIDEO as VideoMode)
  ? (process.env.OPENREAD_PLAYWRIGHT_VIDEO as VideoMode)
  : 'retain-on-failure';
const trace = isStorageLifecycleRun
  ? {
      mode: 'on' as const,
      attachments: false,
      screenshots: false,
      snapshots: false,
      sources: false,
    }
  : ('retain-on-failure' as const);
const video = isStorageLifecycleRun
  ? { mode: videoMode, size: { width: 1280, height: 720 } }
  : videoMode;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,

  // Must exceed nested budget: library sync (30s) + reader wait (30s) +
  // response poll. Matches dev — a tighter budget flakes when Supabase
  // is under load.
  timeout: 180_000,
  expect: { timeout: 15_000 },

  // Shared test user — parallel workers flake via Supabase rate limits.
  workers: 1,

  retries: process.env['CI'] ? 2 : 1,

  snapshotDir: `${BUCKET}/baselines`,
  snapshotPathTemplate: '{snapshotDir}/{testFileName}/{arg}-{projectName}{ext}',

  use: {
    baseURL: configuredBaseURL,
    trace,
    video,
    // Diff output path is controlled by snapshotPathTemplate above, not by
    // the screenshot option (which in recent @playwright/test no longer
    // accepts a `path` field on the object form). Per-project snapshot
    // directories land under {snapshotDir}/{testFileName}/.
    screenshot: screenshotMode,
  },

  ...(shouldStartWebServer
    ? {
        webServer: {
          command: 'corepack pnpm dev-web',
          port: 3000,
          reuseExistingServer:
            process.env.OPENREAD_E2E_REUSE_SERVER === 'false' ? false : !process.env['CI'],
          timeout: 120_000,
        },
      }
    : {}),

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }, // macOS Safari desktop
    {
      name: 'msedge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }, // Android web layer
    { name: 'mobile-webkit', use: { ...devices['iPhone 15 Pro'] } }, // iOS phone web layer
    { name: 'mobile-webkit-ipad', use: { ...devices['iPad Pro 11'] } }, // iPadOS web layer
    // Visual regression lane (separate project, run from its own command)
    {
      name: 'ui-regression',
      testDir: './e2e/ui',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
