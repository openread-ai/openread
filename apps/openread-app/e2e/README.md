# Playwright E2E tests — openread-app

App-level Playwright coverage for Openread web-mode flows. The current QA focus is **Chromium-first**: stabilize web Chromium lanes, collect evidence in Notion, then expand browser/native coverage.

---

## Architecture

```txt
e2e/
├── activity/          Activity/readiness helper specs
├── fixtures/          Auth fixtures, test users, disposable upload books
│   ├── auth.ts        Injects Supabase session into custom + sb-<ref> keys
│   └── books/         Small disposable fixtures for import/upload tests
├── helpers/           Cross-spec helpers such as reader navigation/selection
├── pages/             Page Object Model classes; actions + queries only
├── reporters/         E2E-local QA Run Tracker Notion reporter
├── smoke/             Small smoke specs outside the lane matrix
├── tests/
│   ├── activity/      Activity/readiness checks
│   ├── api/           HTTP-only specs (reserved)
│   ├── catalog/       Explore/catalog Chromium coverage
│   ├── library/       Library route/import/chrome coverage
│   ├── reader/        Reader chrome + annotation coverage
│   ├── settings/      Settings/account/storage/billing/API key coverage
│   ├── sync/          Mocked sync/offline coverage
│   └── ui/            Legacy/general UI specs
├── probes/            AI assistant probe specs + manifest
└── utils/             Legacy/shared utilities
```

Specs should still read like a user story:

```ts
test('user opens a book and reader renders', async ({ authenticatedPage }) => {
  const library = new LibraryPage(authenticatedPage);
  const reader = new ReaderPage(authenticatedPage);

  await library.goto();
  await library.expectLoaded();
  await library.clickFirstBook();
  await reader.waitForReaderUrl();
  await expect(reader.inlineQuestionBar()).toBeVisible();
});
```

---

## Chromium-first lanes

Use the lane runner when collecting Activity/Notion evidence. It runs in web mode with `.env.web` / `NEXT_PUBLIC_APP_PLATFORM=web`, writes artifacts under `~/.openread-dev/activity-artifacts/<activity>/<attempt>/testing/<lane>/`, uploads final evidence when configured, and wires the E2E-local QA Run Tracker reporter.

From `apps/openread-app/`:

```sh
corepack pnpm exec node scripts/testing/run-chromium-lane.mjs \
  --activity ACT-011 \
  --attempt chromium-reader-feature-1 \
  --lane chromium-reader \
  --run-level feature
```

From `apps/openread-app/e2e/`, keep package commands rooted at the app directory with `--dir ..`:

```sh
corepack pnpm --dir .. exec node scripts/testing/run-chromium-lane.mjs \
  --activity ACT-011 \
  --attempt chromium-reader-feature-1 \
  --lane chromium-reader \
  --run-level feature
```

Common lanes:

```sh
corepack pnpm test:lane:chromium-smoke
corepack pnpm test:lane:chromium-library
corepack pnpm test:lane:chromium-reader
corepack pnpm test:lane:chromium-settings
corepack pnpm test:lane:chromium-catalog
corepack pnpm test:lane:chromium-sync
```

Focused scenario example:

```sh
corepack pnpm exec node scripts/testing/run-chromium-lane.mjs \
  --activity ACT-011 \
  --attempt reader-settings-scenario-1 \
  --lane chromium-reader \
  --run-level scenario \
  --manual-case 5a \
  --scenario reader-settings \
  --grep "reader settings"
```

Resume behavior: when the same Activity ID + attempt/run ID is reused, the runner reads Notion QA rows and skips scenarios already logged as final `scenario-status=passed` or `scenario-status=flaky`. Add `--resume-from-notion false` to force a full rerun with the same ID.

---

## Notion QA structure

For a dedicated QA suite Activity, create/sync the Activity page with the lean QA-run template before starting the lane:

```sh
corepack pnpm --dir .. exec node scripts/activity/init.mjs \
  --title "Chromium all UI suite" \
  --slug chromium-all-ui-suite \
  --template qa-run

corepack pnpm --dir .. exec node scripts/activity/notion-sync.mjs \
  --activity ACT-014 \
  --attempt activity-page \
  --write
```

This avoids the generic Activity scaffold and keeps the page simple: `Run Summary`, `Chromium`, and `Raw Artifacts`.

The Playwright reporter lives with E2E under `e2e/reporters/`:

- `qa-run-tracker-reporter.mjs` — Playwright reporter hook.
- `qa-run-tracker.mjs` — Notion read/append helpers.

When enabled by the lane runner, it writes:

```txt
Run Summary
└── Platforms
    └── Chromium
Chromium
└── <Feature>
    └── <Test name>
        └── Evidence
Raw Artifacts
```

It records:

- `run-start` / previous progress summary.
- One terminal `scenario-status` card per Playwright `test(...)` as soon as that test is done.
- Screenshots attach immediately under that test's `Evidence` toggle.
- Videos attach only for failed/timed-out/interrupted tests.
- Traces stay local; cards show the trace count as retained locally.
- `run-complete` / `run-failed` at the end of the Playwright run, counted by unique final scenarios.
- A final `evidence-set-complete` row after raw lane evidence upload.

The tracker is Notion-first. Do not use a local `checkpoint.json` as progress state.

---

## Direct Playwright runs

Use direct Playwright commands for fast local debugging when Activity/Notion evidence is not needed.

From `apps/openread-app/`:

```sh
# Install Chromium once
corepack pnpm exec playwright install chromium

# Fast feedback — one spec on Chromium
corepack pnpm exec playwright test e2e/tests/ui/auth.spec.ts --project=chromium

# Reader-only Chromium coverage
corepack pnpm exec playwright test e2e/tests/reader --project=chromium

# All app-level Chromium specs
corepack pnpm exec playwright test e2e/tests --project=chromium

# Show the last HTML report
corepack pnpm exec playwright show-report
```

From `apps/openread-app/e2e/`, use `--dir ..` and keep paths rooted at `apps/openread-app/`:

```sh
corepack pnpm --dir .. exec playwright test e2e/tests/ui/auth.spec.ts --project=chromium
corepack pnpm --dir .. exec playwright test e2e/tests/reader --project=chromium
corepack pnpm --dir .. exec playwright show-report
```

The Playwright config auto-starts `dev-web` on port 3000 and loads web/test env files for the runner process.

---

## Platform matrix

Playwright covers product surfaces at the **web layer** via browser engine, viewport, and UA emulation. Chromium is the current stabilization baseline.

| Project name      | Covers platform             | Notes                                                         |
| ----------------- | --------------------------- | ------------------------------------------------------------- |
| `chromium`        | web · mac-web · windows-web | Primary Chromium-first baseline                               |
| `webkit`          | mac/iOS web-layer signal    | Safari/WKWebView-family browser signal                        |
| `msedge`          | windows-web                 | Uses installed Edge channel                                   |
| `mobile-chromium` | android web layer           | Pixel viewport+UA; not a real Android device                  |
| `mobile-webkit`   | ios/ipad web layer          | iPhone/iPad viewport+UA; not a real iOS device                |
| `ui-regression`   | visual baselines            | Pinned viewport; baselines under `~/.openread-dev/artifacts/` |

**Not covered by Playwright browser E2E:**

- Real iOS device UI — use native/XCUITest/Appium-oriented lanes.
- Real Android emulator/device UI — use V3 Android native scripts and ADB.
- macOS/Windows Tauri shell — Playwright drives browsers, not Tauri windows; use `tauri-driver`-style coverage separately.
- Linux — not a supported product platform.

---

## Auth behavior

The `authenticatedPage` fixture makes a Supabase `signInWithPassword` call, caches the session for the test run, and injects it into browser storage before first navigation.

Two writes are required:

1. Custom keys — `token`, `refresh_token`, `user` — read by `AuthContext`.
2. `sb-<projectRef>-auth-token` — read by `@supabase/supabase-js` during refresh.

Without both, the first render can clear the custom keys after Supabase refresh fails.

---

## Native and future coverage

| Item                                                   | Status / blocker                                          |
| ------------------------------------------------------ | --------------------------------------------------------- |
| macOS Tauri smoke via `tauri-driver`                   | Separate native-shell lane, not Playwright browser E2E    |
| Windows Tauri smoke via `tauri-driver`                 | Separate native-shell lane; Windows runner needed         |
| iOS physical device via `ios-deploy` + Appium/XCUITest | Playwright cannot drive a real device                     |
| Android device automation via Appium + ADB             | Playwright cannot drive a real device                     |
| Exact Free/Reader/Pro numeric tier limits              | Deferred until product limits are finalized               |
| Delete/remove book flow                                | Intentionally excluded from disposable-upload QA strategy |
