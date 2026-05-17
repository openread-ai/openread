# E2E QA Runner

This folder owns E2E-specific QA orchestration: named targets, platform/matrix
selection, Playwright- and native-ctl-backed runs, lean Notion QA pages,
evidence upload, reruns, and promotion from focused tests to broader lanes.

It intentionally does **not** modify or depend on the broader lifecycle scripts
in `scripts/activity/`.

## Commands

From `apps/openread-app`:

```bash
node e2e/qa/cli.mjs run --activity ACT-031 --target act-026-reader-failures
```

Useful variants:

```bash
# One failure / scenario on the default platform: web-chromium
node e2e/qa/cli.mjs run --activity ACT-031 --target reader-settings-panels

# Same target on another Playwright platform
node e2e/qa/cli.mjs run --activity ACT-031 --target reader-settings-panels --platform web-webkit
node e2e/qa/cli.mjs run --activity ACT-031 --target reader-settings-panels --platform web-edge

# A platform matrix
node e2e/qa/cli.mjs run --activity ACT-031 --target act-026-reader-failures --matrix all-web

# Repeat the latest target after a fix
node e2e/qa/cli.mjs rerun --activity ACT-031

# Promote to the next target from targets.json
node e2e/qa/cli.mjs continue --activity ACT-031

# Full lane / suite; chromium-* aliases still work
node e2e/qa/cli.mjs run --activity ACT-031 --lane reader
node e2e/qa/cli.mjs run --activity ACT-031 --lane chromium-reader
node e2e/qa/cli.mjs run --activity ACT-031 --lane all-ui

# Local-only debugging with no Notion upload
node e2e/qa/cli.mjs run --activity ACT-031 --target reader-settings-panels --local-only

# Scalable one-platform evidence flow for feature/platform closure
node e2e/qa/cli.mjs notion-init --activity ACT-093 --platform web-chromium
node e2e/qa/cli.mjs platform-run --activity ACT-093 --target settings --platform web-chromium
node e2e/qa/cli.mjs platform-publish --activity ACT-093 --attempt settings-web-chromium-20260514 --platform web-chromium

# Matrix flow: Playwright-backed platforms can run in parallel; native/Tauri stay serial
node e2e/qa/cli.mjs matrix-run --activity ACT-093 --target settings --matrix playwright-all --concurrency 3

# Local/Notion cleanup; dry-run by default, add --execute to delete/trash
node e2e/qa/cli.mjs gc --activity ACT-093 --delete-attempts stale-attempt-id
node e2e/qa/cli.mjs gc --activity ACT-093 --page <notion-page-id> --execute

# Inspect registries
node e2e/qa/cli.mjs targets
node e2e/qa/cli.mjs platforms
node e2e/qa/cli.mjs matrices

# Verify Notion shape and evidence
node e2e/qa/cli.mjs verify --activity ACT-031
```

## Structure

```txt
e2e/qa/
├─ cli.mjs                     # canonical E2E QA command
├─ targets.json                # named single/group/lane/suite targets
├─ registry/
│  ├─ platforms.json           # platform adapters/projects
│  ├─ matrices.json            # reusable platform groups
│  ├─ ad-hoc.json              # temporary/manual requests
│  ├─ debug-targets.json       # historical/debug targets
│  └─ features/                # stable feature workflows, e.g. core-ui.json, settings.json
├─ adapters/
│  ├─ index.mjs                # adapter dispatch
│  ├─ native-ctl.mjs           # Appium/native ctl adapter
│  └─ playwright.mjs           # web/browser/mobile-web Playwright adapter
├─ templates/qa-run.mjs        # lean Notion QA page blocks
├─ lib/common.mjs              # local activity state, env, git, artifact helpers
├─ lib/notion.mjs              # Notion page/evidence/verification helpers
└─ README.md
```

## Platform model

Targets describe _what_ to run. Platforms describe _how/where_ to run it.

Current implemented adapters:

```txt
playwright  → web-chromium, web-webkit, web-edge, mobile-web-android, mobile-web-ios, mobile-web-ipados
native-ctl  → native-ios, native-ipados, native-android, tauri-windows, tauri-macos
```

Native mobile runs require an Appium 2 server and installed Openread native apps.
Android Settings contract runs are internally split into fresh Appium session batches
(default batch size: 12 scenarios) so a long tail WebView/session failure cannot hang
the whole lane without a bounded WebDriver timeout and progress logs. Final native
Settings closure should use strict evidence mode and real test-user auth. Plan-specific
native scenarios use `TEST_USER_FREE_EMAIL`/`TEST_USER_FREE_PASSWORD` and
`TEST_USER_READER_EMAIL`/`TEST_USER_READER_PASSWORD` when present; `reader` falls back
to `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`.
Start Appium with `corepack pnpm native:appium:start` and run the matrix with:

```sh
node e2e/qa/cli.mjs run --activity ACT-092 --lane settings --matrix native-mobile
```

Desktop Tauri health/capture lanes are registered in the `tauri-desktop` matrix:

```txt
tauri-windows → local Windows host/VM + tauri-driver + msedgedriver + built Windows app binary
tauri-macos   → local macOS host + in-app Tauri QA controller + AX/open/screencapture + built .app; tauri-driver v2 is unsupported on macOS
```

Both desktop Tauri lanes provide controller-backed health/capture evidence. `tauri-macos`
uses an in-app Tauri QA controller for Settings SET validation because `tauri-driver v2.0.6`
reports unsupported on macOS. The controller is QA-gated, drives/asserts real route/UI
state, posts a local callback result to the native runner, and then the runner captures a
macOS screenshot. That evidence is emitted as `qa-seam-real-ui`. The legacy
`--macos-settings-controller bridge` path remains available for capture debugging but emits
`fixture-overlay`, which strict contract mode rejects as provisional. Desktop-only external
MCP scenario `SET-049` still requires a separate redacted external-client evidence adapter;
the default macOS Settings UI-controller run excludes that SET so it remains open instead of
being closed with route-only evidence. `tauri-windows` still needs its SET runner on a local
Windows host/VM before it can close Settings contract cells.

Add future platforms in `registry/platforms.json`; add groups in
`registry/matrices.json`; add adapters under `adapters/` when a platform needs a
non-Playwright runner.

## Notion behavior

The legacy `run` command uses the lean `qa-run` template. The scalable
`platform-run`/`platform-publish` flow uses an even lighter platform section shape.
`matrix-run` is a wrapper around the same `platform-run` publisher: it parallelizes
Playwright-backed web/mobile-web platforms up to `--concurrency` and keeps native/Tauri
platforms sequential unless isolated devices/ports are configured.

The platform section shape is:

```txt
Run Summary
Platform Review Queue
Platforms
  <Platform label> — <platform-id>
    Status
    Timing
    Cells
    Run
    Evidence screenshots
Raw Artifacts
```

Scenario screenshots are assertion-time Playwright attachments named
`evidence:*`; generic end-of-test screenshots are kept as debug fallback only.
`platform-publish` uploads only screenshots from the same platform attempt being
published. The runner stores `notionActivityPageId` and `notionActivityPageUrl` in
the local `activity.json`, so reruns do not need a manual page ID.

## Promotion model

Each target can define `promoteTo`:

```txt
single failure → grouped failure target → feature lane → all-ui
```

Use `continue` to run the next target after the focused run is green.

## Registry policy

- Stable reusable feature workflows live in `registry/features/<feature>.json`.
- Temporary/manual requests live in `registry/ad-hoc.json`.
- Historical/debug-only targets live in `registry/debug-targets.json`.
- `targets.json` remains the compatibility base while feature workflows are migrated.

## GC policy

- `gc` is dry-run by default.
- Use `--execute` only after reviewing the planned local deletes / Notion trash moves.
- Local deletion is restricted to the activity artifact root or `/tmp`.
- Notion pages are moved to Trash; permanent deletion remains a manual Notion action.

## Evidence modes

Strict Settings contract audits accept only:

- `real-ui`
- `qa-seam-real-ui`
- `controller-real-ui`

`fixture-overlay` and screenshot-only fallback evidence are provisional and remain open under
`--strict-evidence`.

Contract audits also compute platform-aware screenshot slot coverage for every required platform
cell. The audit compares each contract `Screenshot evidence` slot with actual `evidence:*`
attachments for that SET/platform and reports missing start slots, missing terminal slots, and slot
name mismatches. Add `--strict-slots` to make those slot gaps open the platform cell; without it,
slot gaps are reported in `slotAudit` for migration visibility while legacy scenario-level closure
continues to work.

## Visual contract proof alarm

QA contract coverage runs the generic visual proof alarm before a required cell can close. The alarm
is contract-agnostic and is wired into the Settings contract coverage first.

A cell stays open as `visual-proof-alarm` only for explicit-deny patterns:

- Expected mentions an endpoint, direct request/probe, MCP/auth flow, download/export, checkout,
  portal, webhook, external handoff, or artifact, but the run only provides UI screenshots and no
  redacted request/response/log/artifact proof.
- Terminal evidence is a loading/skeleton/placeholder/blank/404-style slot instead of the resolved
  terminal state.

The alarm also records advisory warnings, without reopening otherwise matched cells, when start and
terminal screenshots are byte-identical for a transition-like contract or terminal screenshots are
byte-identical across different contracts on the same platform. Treat those as recapture guidance;
they are not hard blockers because some native/controller captures intentionally prove invariant
states with identical screenshots.

Practical policy:

- Explicit deny = must fix now.
- Advisory = visible debt / reviewer signal.
- Proceed on advisories unless they overlap an open required slot, gain an explicit-deny finding, or
  a human reviewer challenges the evidence.
- If 2–3 consecutive attempts fail to remove an advisory without producing an explicit deny, call out
  this policy in the handoff and move forward instead of continuing to churn.

For non-UI assertions, attach an `evidence:*` JSON/text artifact or include structured controller
`details` proving the request method/path/status/body or exported/downloaded artifact. Screenshots
remain required for visual state, but captions/counts alone are not enough.

## Evidence defaults

- Scenario screenshots upload by default with a cap of 1000.
- Traces upload by default with a cap of 4 when present.
- Videos upload by default with a cap of 4 when present.
- Use `--local-only` for temporary, no-Notion debugging.
