# Openread Everything Current-State and QA Baseline

This machine-consumed registry contract records Openread's current behavior, platform differences, validation expectations, and known wiring risks. The human-readable source lives in private `openread-docs/testing/`; this local copy remains executable test input.

Use this document to answer:

- What exists today?
- Which platforms support it?
- Which controls and entry points expose it?
- What state, route, persistence, or native bridge wiring matters?
- What is duplicated, ambiguous, hidden, disabled, or weird?
- What must be checked before future deployment or development?

## Table of contents

- [0. Document tree](#0-document-tree)
- [1. Purpose and usage](#1-purpose-and-usage)
  - [Scope](#scope)
  - [Non-goals](#non-goals)
  - [Update rules](#update-rules)
  - [Status labels](#status-labels)
  - [Evidence expectations](#evidence-expectations)
- [2. Platform surface matrix](#2-platform-surface-matrix)
  - [Supported product surfaces](#supported-product-surfaces)
  - [Granular validation lanes](#granular-validation-lanes)
  - [Overlap and differentiation rules](#overlap-and-differentiation-rules)
  - [Lane selection rules](#lane-selection-rules)
  - [Distribution and user access model](#distribution-and-user-access-model)
  - [User-centered update awareness and state continuity](#user-centered-update-awareness-and-state-continuity)
  - [Current distribution structure](#current-distribution-structure)
  - [CI/CD and release process](#cicd-and-release-process)
  - [Current CI/CD workflow inventory](#current-cicd-workflow-inventory)
  - [Required CI/CD accounting gates](#required-cicd-accounting-gates)
  - [Distribution gaps and watch items](#distribution-gaps-and-watch-items)
- [3. Global app flows](#3-global-app-flows)
  - [App launch and shell](#app-launch-and-shell)
  - [Auth/session state](#authsession-state)
  - [Navigation and routing](#navigation-and-routing)
  - [Offline/online behavior](#offlineonline-behavior)
  - [Sync state](#sync-state)
  - [Error/recovery behavior](#errorrecovery-behavior)
- [4. Feature baselines](#4-feature-baselines)
  - [4.1 Library](#41-library)
  - [4.2 Reader](#42-reader)
  - [4.3 Catalog / Explore](#43-catalog--explore)
  - [4.4 AI assistant](#44-ai-assistant)
  - [4.5 Search](#45-search)
  - [4.6 Annotations / Notes](#46-annotations--notes)
  - [4.7 Settings](#47-settings)
  - [4.8 Sync](#48-sync)
  - [4.9 Billing / quotas](#49-billing--quotas)
  - [4.10 MCP / API keys](#410-mcp--api-keys)
  - [4.11 Native shell integrations](#411-native-shell-integrations)
- [5. Cross-feature inconsistencies and weird wiring](#5-cross-feature-inconsistencies-and-weird-wiring)
- [6. QA baseline](#6-qa-baseline)
  - [Manual smoke checks](#manual-smoke-checks)
  - [Feature-level checks](#feature-level-checks)
  - [Platform-specific checks](#platform-specific-checks)
  - [Release/deployment checks](#releasedeployment-checks)
- [7. Implementation reference map](#7-implementation-reference-map)

<a id="0-document-tree"></a>

## 0. Document tree

```txt
Openread Everything Current-State and QA Baseline
├─ 0. Document tree
├─ 1. Purpose and usage
│  ├─ Scope
│  ├─ Update rules
│  ├─ Status labels
│  └─ Evidence expectations
├─ 2. Platform surface matrix
│  ├─ Supported product surfaces
│  ├─ Granular validation lanes
│  ├─ Overlap and differentiation rules
│  ├─ Lane selection rules
│  ├─ Distribution and user access model
│  ├─ User-centered update awareness and state continuity
│  ├─ Current distribution structure
│  ├─ CI/CD and release process
│  ├─ Current CI/CD workflow inventory
│  ├─ Required CI/CD accounting gates
│  └─ Distribution gaps and watch items
├─ 3. Global app flows
│  ├─ App launch and shell
│  ├─ Auth/session state
│  ├─ Navigation and routing
│  ├─ Offline/online behavior
│  ├─ Sync state
│  └─ Error/recovery behavior
├─ 4. Feature baselines
│  ├─ Library
│  ├─ Reader
│  ├─ Catalog / Explore
│  ├─ AI assistant
│  ├─ Search
│  ├─ Annotations / Notes
│  ├─ Settings
│  ├─ Sync
│  ├─ Billing / quotas
│  ├─ MCP / API keys
│  └─ Native shell integrations
├─ 5. Cross-feature inconsistencies and weird wiring
│  ├─ Duplicate labels
│  ├─ Multiple entry points to the same action
│  ├─ Platform mismatches
│  ├─ Disabled or hidden controls
│  ├─ Stale state risks
│  ├─ Routing/deep-link risks
│  └─ Native bridge risks
├─ 6. QA baseline
│  ├─ Manual smoke checks
│  ├─ Feature-level checks
│  ├─ Platform-specific checks
│  ├─ Release/deployment checks
│  └─ Evidence requirements
└─ 7. Implementation reference map
   ├─ Routes
   ├─ Components
   ├─ Stores
   ├─ Services
   ├─ Native bridges
   └─ Existing automated tests
```

<a id="1-purpose-and-usage"></a>

## 1. Purpose and usage

<a id="scope"></a>

### Scope

- [ ] Product-wide current-state baseline for Openread.
- [ ] Manual QA source of truth for what should be checked.
- [ ] Automation planning source of truth for what should become scripted.
- [ ] Release/deployment signoff reference.
- [ ] Future feature inclusion checklist.
- [ ] Known inconsistency and weird-wiring register.

<a id="non-goals"></a>

### Non-goals

- [ ] Do not use this as a wishlist without labeling future work.
- [ ] Do not mark desired behavior as current behavior unless implementation has been verified.
- [ ] Do not remove a weird or inconsistent behavior just because it is embarrassing; label it and keep it visible until fixed.

<a id="update-rules"></a>

### Update rules

- [ ] Every feature addition should update its feature baseline before release.
- [ ] Every platform-specific behavior should be listed under platform behavior, not buried in a generic checklist item.
- [ ] Every duplicated control should say whether it is intentional, confusing, broken, deprecated, or unknown.
- [ ] Every known non-working control should be listed as a known issue or watch item.
- [ ] Every future/planned behavior must be labeled `Future / planned`.
- [ ] Every baseline change should include implementation references when practical.

<a id="status-labels"></a>

### Status labels

Use these labels consistently so current behavior, risks, and future intent do not get mixed together.

```txt
Status labels
├─ Current
├─ Platform-specific
├─ Watch item
├─ Known issue
├─ Future / planned
├─ Deprecated / hidden
├─ Unknown / needs audit
└─ Not applicable
```

- `Current`: implemented and expected to work today.
- `Platform-specific`: implemented only on listed platforms or with different platform behavior.
- `Watch item`: potential inconsistency, risk, or weird wiring that needs validation.
- `Known issue`: verified broken or incomplete behavior.
- `Future / planned`: desired or planned behavior that should not be tested as current.
- `Deprecated / hidden`: code or UI exists but should not be exposed in normal product flows.
- `Unknown / needs audit`: not yet verified against current implementation.
- `Not applicable`: intentionally irrelevant for a platform or feature.

<a id="evidence-expectations"></a>

### Evidence expectations

- [ ] Record platform, app/runtime, account/tier, route, feature area, and book/file when applicable.
- [ ] Capture screenshots for static UI surfaces.
- [ ] Capture video for gestures, native bridges, transient menus, platform-specific behavior, and failures.
- [ ] Record exact entry point and expected vs actual behavior for bugs.
- [ ] Link to automated test, manual run, or implementation reference when available.

<a id="2-platform-surface-matrix"></a>

## 2. Platform surface matrix

A platform surface is a user-visible runtime where Openread can behave differently. A validation lane is a more specific slice of a platform surface used for testing and release signoff.

<a id="supported-product-surfaces"></a>

### Supported product surfaces

Use these as product surfaces: broad user-visible runtimes where Openread can behave differently.

```txt
Supported product surfaces
├─ Web surfaces
│  ├─ Web desktop
│  └─ Mobile web
├─ Desktop native surfaces
│  ├─ macOS Tauri
│  └─ Windows Tauri
└─ Mobile native surfaces
   ├─ iOS native
   └─ Android native
```

#### Web desktop

- Runtime: desktop browser.
- Coverage role: first broad automation and manual baseline.
- Notes: Chromium is the first baseline; WebKit/Safari and Edge/Windows remain separate when browser engine or OS behavior matters.

#### Mobile web

- Runtime: iOS Safari/WebKit and Android Chrome browser viewports.
- Coverage role: mobile browser baseline.
- Notes: uses responsive web/mobile UI only; do not assume native Tauri UIKit or Android bridge behavior.

#### macOS Tauri

- Runtime: installed desktop native shell with WebView.
- Coverage role: native desktop baseline for macOS.
- Notes: adds app shell, file access, native window behavior, native menu/context-menu paths, updater behavior, and macOS traffic-light behavior.

#### Windows Tauri

- Runtime: installed desktop native shell with WebView2.
- Coverage role: native desktop baseline for Windows.
- Notes: adds Windows app shell, WebView2 behavior, file access, Windows shortcuts/context menus, updater behavior, and window-control behavior.

#### iOS native

- Runtime: Tauri iOS app using WKWebView plus UIKit overlays.
- Coverage role: highest-divergence mobile baseline.
- Notes: adds native footer, native edit menu, native color picker, safe-area handling, keyboard behavior, native chat composer paths, App Store/IAP behavior, and iOS bridge messages.

#### Android native

- Runtime: Tauri Android app using WebView plus native bridge behavior.
- Coverage role: Android app baseline.
- Notes: mostly web mobile UI plus Android Back, device buttons, selection behavior, native bridge behavior, Play Store/IAP behavior, and Android WebView lifecycle.

<a id="granular-validation-lanes"></a>

### Granular validation lanes

Use these as validation lanes: narrower slices of a product surface that deserve separate test evidence when behavior can diverge.

```txt
Granular validation lanes
├─ Web desktop lanes
│  ├─ web-chromium
│  ├─ web-webkit
│  └─ web-edge-windows
├─ Mobile web lanes
│  ├─ mobile-web-ios
│  └─ mobile-web-android
├─ Desktop native lanes
│  ├─ tauri-macos
│  └─ tauri-windows
└─ Mobile native lanes
   ├─ native-ios
   └─ native-android
```

#### `web-chromium`

- Product surface: Web desktop.
- Represents: desktop web app in Chrome/Chromium.
- Keep separate because: it is the first automation baseline and broadest stable selector/runtime target.

#### `web-webkit`

- Product surface: Web desktop.
- Represents: desktop Safari/WebKit.
- Keep separate because: WebKit can differ in layout, selection, media, scrolling, iframe behavior, and browser APIs.

#### `web-edge-windows`

- Product surface: Web desktop.
- Represents: Edge browser on Windows.
- Keep separate because: Chromium-family behavior overlaps with `web-chromium`, but Windows OS/browser behavior can affect fonts, shortcuts, scrollbars, permissions, and context menus.

#### `mobile-web-ios`

- Product surface: Mobile web.
- Represents: iOS Safari/mobile WebKit viewport.
- Keep separate because: touch, mobile keyboard, safe-area, selection, viewport, and WebKit behavior differ from desktop Safari and native iOS.

#### `mobile-web-android`

- Product surface: Mobile web.
- Represents: Android Chrome/mobile browser viewport.
- Keep separate because: touch, keyboard, Android browser permissions, viewport, and mobile-web behavior differ from desktop Chromium and native Android.

#### `tauri-macos`

- Product surface: macOS Tauri.
- Represents: installed macOS desktop app.
- Keep separate because: native shell, file/open behavior, native window controls, app lifecycle, updater behavior, and native context-menu paths differ from web.

#### `tauri-windows`

- Product surface: Windows Tauri.
- Represents: installed Windows desktop app.
- Keep separate because: native shell, WebView2, Windows window controls, app lifecycle, file/open behavior, updater behavior, and native context-menu paths differ from web and macOS.

#### `native-ios`

- Product surface: iOS native.
- Represents: installed iOS app in WKWebView with UIKit overlays.
- Keep separate because: it has the highest UI/runtime divergence: native footer, edit menu, color picker, safe areas, keyboard/composer behavior, App Store constraints, and bridge messages.

#### `native-android`

- Product surface: Android native.
- Represents: installed Android app in WebView with native bridge behavior.
- Keep separate because: Android Back, selection, device buttons, app lifecycle, Play Store constraints, WebView lifecycle, and bridge callbacks differ from mobile web.

<a id="overlap-and-differentiation-rules"></a>

### Overlap and differentiation rules

Use this section to avoid double-counting lanes that share implementation while still preserving the reason they need separate evidence.

```txt
Overlap and differentiation rules
├─ Chromium web overlap
│  └─ web-chromium ↔ web-edge-windows
├─ WebKit overlap
│  └─ web-webkit ↔ mobile-web-ios
├─ iOS overlap
│  └─ mobile-web-ios ↔ native-ios
├─ Android overlap
│  └─ mobile-web-android ↔ native-android
├─ Windows overlap
│  └─ web-edge-windows ↔ tauri-windows
└─ Web/native desktop overlap
   └─ web-chromium ↔ tauri-macos
```

#### `web-chromium` and `web-edge-windows`

- Shared behavior: Chromium-family desktop web app.
- Differentiator: Windows OS/browser behavior can affect fonts, scrollbars, shortcuts, permissions, and context menus.
- QA implication: start with `web-chromium`, then add `web-edge-windows` for Windows-specific reports or features touching browser/OS integration.

#### `web-webkit` and `mobile-web-ios`

- Shared behavior: WebKit-based rendering engine.
- Differentiator: desktop Safari differs from mobile Safari in viewport, touch, keyboard, safe-area, and selection behavior.
- QA implication: WebKit pass does not replace mobile iOS browser pass when responsive/touch/keyboard behavior changes.

#### `mobile-web-ios` and `native-ios`

- Shared behavior: both run on iOS/WebKit underneath.
- Differentiator: native iOS adds UIKit footer, native edit menu, native color picker, native bridge, native composer, safe-area integration, store constraints, and app lifecycle.
- QA implication: always validate `native-ios` separately for reader chrome, selection, keyboard, App Store/IAP, auth callback, and native bridge changes.

#### `mobile-web-android` and `native-android`

- Shared behavior: Android/mobile web-like runtime.
- Differentiator: native Android adds Back button handling, device buttons, bridge callbacks, app shell behavior, Play Store constraints, and WebView lifecycle.
- QA implication: mobile web Android does not prove native Android Back/device-button/bridge behavior.

#### `web-edge-windows` and `tauri-windows`

- Shared behavior: Chromium/WebView2-family rendering on Windows.
- Differentiator: Edge is a browser tab/runtime; Tauri is an installed app shell with file access, native window behavior, updater behavior, and app lifecycle.
- QA implication: validate `tauri-windows` when file open/import, updater, window controls, native menus, app lifecycle, or WebView2 shell behavior changes.

#### `web-chromium` and `tauri-macos`

- Shared behavior: same React/web UI for many flows.
- Differentiator: browser runtime differs from native macOS shell, file access, native menu/window behavior, updater behavior, and app lifecycle.
- QA implication: validate `tauri-macos` when native file/window/menu/updater behavior changes, even if `web-chromium` passed.

<a id="lane-selection-rules"></a>

### Lane selection rules

- [ ] Start broad web validation with `web-chromium`.
- [ ] Add `web-webkit` when browser engine behavior matters: layout, text selection, media, iframe, scrolling, or WebKit APIs.
- [ ] Add `web-edge-windows` when Windows browser behavior matters: shortcuts, fonts, scrollbars, permissions, context menus, or Windows-specific user reports.
- [ ] Add `mobile-web-ios` or `mobile-web-android` when touch, responsive layout, mobile keyboard, viewport, or browser safe-area behavior changes.
- [ ] Add `tauri-macos` or `tauri-windows` when native shell, file access, app lifecycle, native context menu, or window controls change.
- [ ] Always include `native-ios` when UIKit overlays, native edit menu, color picker, safe areas, keyboard/composer behavior, or iOS bridge messages change.
- [ ] Include `native-android` when Android Back, device buttons, selection behavior, WebView lifecycle, app shell, or Android bridge messages change.

<a id="distribution-and-user-access-model"></a>

### Distribution and user access model

Distribution is separate from validation lanes. A lane tells us where behavior may differ; distribution tells us how a real user gets into that surface and how updates reach them.

```txt
Distribution and user access
├─ Web app
│  ├─ User access: browser URL
│  ├─ Deployment: hosted Next.js app
│  └─ Update model: server deployment / refresh
├─ Mobile web / PWA
│  ├─ User access: mobile browser URL or installed PWA shortcut
│  ├─ Deployment: same hosted web app
│  └─ Update model: service worker + web deployment
├─ Desktop native
│  ├─ User access: installer, DMG, App Store, or portable/AppImage artifact
│  ├─ Deployment: Tauri bundle built from static Next export
│  └─ Update model: Tauri updater, store update, or direct artifact download
├─ Mobile native
│  ├─ User access: App Store / Google Play / test build
│  ├─ Deployment: Tauri iOS/Android build
│  └─ Update model: store update, release notes, or direct APK for non-store Android
├─ API/backend
│  ├─ User access: indirectly through app, MCP, SDK, or integrations
│  ├─ Deployment: hosted API/serverless endpoints
│  └─ Update model: backend deploy
└─ Developer/AI integrations
   ├─ User access: npm package or plugin install
   ├─ Deployment: npm/package release
   └─ Update model: user/client updates installed package
```

<a id="user-centered-update-awareness-and-state-continuity"></a>

### User-centered update awareness and state continuity

From the user's perspective, an update flow has four moments: notice, choice, state checkpoint, and resume. The fastest safe update experience is usually not applying code in a few milliseconds; it is making the user's state durable in milliseconds before a reload, restart, or store-managed update happens.

```txt
User-centered update flow
├─ 1. Notice
│  ├─ User is told an update exists
│  ├─ App explains whether it is web, native, store, backend, or package update
│  └─ App avoids interrupting reading, editing, download, sync, payment, or import flows
├─ 2. Choice
│  ├─ Immediate update when safe
│  ├─ Defer until later
│  ├─ Auto-apply on next launch/reload when platform controls it
│  └─ Store/package-managed update when app cannot self-apply
├─ 3. State checkpoint
│  ├─ Save route and navigation intent
│  ├─ Save reader/library/settings/AI/editing state
│  ├─ Flush critical local persistence and sync queue metadata
│  └─ Record app/build/schema version used for resume
└─ 4. Resume
   ├─ Reload/relaunch/new version opens
   ├─ App migrates state if needed
   ├─ User returns to same task when safe
   └─ App reports any non-restorable state clearly
```

#### Millisecond expectation

- Current-state reality: code updates for web bundles, service workers, Tauri binaries, App Store builds, Google Play builds, and npm packages cannot be guaranteed to apply in a few milliseconds.
- Reason: applying code usually requires network fetch, browser reload, service-worker activation, binary install, app relaunch, store approval/rollout, or package manager resolution.
- Practical target: checkpoint a small local state snapshot before reload/relaunch as fast as possible, then restore after the new version loads.
- Safe wording for future work: `ms-class checkpoint`, not `ms-class update apply`.
- Risk: forcing instant code replacement during active reader/annotation/AI/import/sync flows can corrupt state or create version mismatch between UI, local cache, and backend APIs.

#### Web desktop update awareness

- How user knows: currently a user naturally gets the new web build on navigation/reload after Vercel deployment; in-session update awareness needs an explicit version/service-worker signal if we want prompts like `Update ready`.
- How update applies: browser reload or new navigation loads the new bundle.
- State continuity target: before reload, checkpoint current route, active page/screen, reader IDs/location, unsaved note or AI draft, settings panel state, and any pending sync/import/download status.
- Fast path: route/local UI snapshot can be written quickly, but full reload time depends on browser, network, cache, and bundle size.
- Watch item: add a web build/version manifest or service-worker update listener if we want reliable in-session notices.

#### Mobile web and PWA update awareness

- How user knows: mobile browser/PWA may discover service-worker updates after navigation, refresh, or an explicit registration update check; a user-facing update prompt needs app code to listen and surface it.
- How update applies: activate the waiting service worker and reload the PWA/window, or wait for next launch/navigation.
- State continuity target: same as web desktop, plus mobile chrome visibility, sheet/dialog state, keyboard/composer draft, safe-area-sensitive UI state, and scroll/reader position.
- Fast path: checkpoint before reload; applying the new service worker is not guaranteed to be millisecond-fast.
- Watch item: define whether PWA updates should be forced, prompted, or deferred until safe points.

#### Desktop native direct-update awareness

This is the macOS/Windows desktop target. The desired user experience makes sense as a product goal: notify the user that an update is ready, let them click once, preserve their current state, and return them to the same task quickly. The precise technical contract should distinguish a millisecond state checkpoint from the slower binary install/relaunch step.

```txt
macOS / Windows fast update target
├─ While app is running
│  ├─ Check update metadata in the background
│  ├─ Download and verify the update before interrupting the user
│  ├─ Notify only when update is ready or nearly ready
│  └─ Defer notification during unsafe flows
├─ When user clicks update notification
│  ├─ Freeze new risky actions briefly
│  ├─ Write a small versioned state checkpoint
│  ├─ Start install/relaunch through updater
│  └─ Show clear progress or relaunch affordance
└─ After relaunch
   ├─ Validate checkpoint compatibility
   ├─ Restore route/window/task state
   ├─ Resume safe pending work
   └─ Report any state that cannot be restored
```

- How user knows: Tauri updater can check for updates; current code checks on an interval controlled by settings and `CHECK_UPDATE_INTERVAL_SEC`, and About/Updater UI can show release notes or update controls.
- Desired notification behavior: for direct macOS/Windows builds, update metadata should be checked while the app is running; if an update is available, the app should pre-download/verify it and then show a desktop/in-app notification such as `Update ready`.
- How update applies: direct desktop builds use Tauri updater/download/install/relaunch; portable Windows paths download a newer portable executable and launch externally.
- Millisecond-safe part: the app can aim to write the state checkpoint in milliseconds when the update has already been downloaded and verified.
- Not millisecond-guaranteed: binary download, signature verification, installer replacement, process exit, process relaunch, OS scheduling, antivirus scanning, and WebView startup cannot be guaranteed to complete in a few milliseconds.
- State continuity target: before install/relaunch, checkpoint open route/window, reader IDs/location, library selection, settings, transfer state, annotation/note drafts, AI draft, and sync queue metadata.
- User-perceived fast path: pre-download and verify in the background, then on click perform only checkpoint + relaunch/install handoff; restore state immediately after the new process starts.
- Unsafe-flow deferral: defer update prompts during active annotation editing, unsaved note/AI draft if not checkpointable, active import/delete, payment/IAP, sync conflict resolution, TTS/RSVP playback if resume is not supported, or native file picker/dialog flows.
- Watch item: release gate should verify that relaunch restores the previous task or intentionally returns to a safe home screen.
- Current-state gap: this baseline does not yet prove a true `click notification → restored updated app` desktop flow; it should be treated as a target workflow until implemented and measured.

#### Store-managed native update awareness

- How user knows: App Store/Google Play may notify the user; app UI can link to store pages or show release notes, but store rollout timing is controlled externally.
- How update applies: store install/update and app restart; the app generally cannot force immediate application on iOS and should not imply direct self-update for store channels.
- State continuity target: durable local app state must survive app termination and binary replacement; restore only state compatible with the new app/schema version.
- Fast path: no millisecond apply guarantee; focus on durable persistence and safe resume on next launch.
- Watch item: separate direct-download updater behavior from App Store / Google Play behavior in release notes and QA.

#### Android direct APK update awareness

- How user knows: non-store Android updater can read update metadata and show an update window when enabled; Google Play channel should use Play Store update expectations.
- How update applies: direct APK download/install package flow, or Play Store update for store builds.
- State continuity target: checkpoint before invoking package install because Android may background or restart the app during installation.
- Fast path: state checkpoint can be fast; package install cannot be assumed fast or uninterrupted.
- Watch item: Play Store builds and sideload/direct APK builds need separate QA for permissions, updater availability, and install prompts.

#### Backend/API update awareness

- How user knows: usually no direct user notice; web/native clients experience backend changes through API behavior.
- How update applies: rolling deploy on the backend; users keep the same client app.
- State continuity target: preserve session compatibility, request retry safety, sync queue compatibility, and API version compatibility across rolling deploys.
- Fast path: backend update can be transparent only if old and new clients remain compatible.
- Watch item: versioning, feature flags, and migration compatibility matter more than user-facing update prompts.

#### MCP, SDK, and plugin update awareness

- How user knows: npm/client tooling, release notes, GitHub releases, or plugin documentation.
- How update applies: user/client updates package or plugin manually or through package manager resolution.
- State continuity target: preserve API compatibility for older installed versions; avoid breaking existing AI client configs.
- Fast path: not app-controlled; package manager/client startup decides when new code is used.
- Watch item: package versioning and API compatibility policy should be explicit before stable releases.

#### Required state checkpoint payload

The checkpoint should be small, versioned, and safe to restore after a reload/relaunch.

```txt
State checkpoint payload
├─ Identity/session
│  ├─ authenticated user/session presence
│  └─ account/tier assumptions used by current UI
├─ Navigation
│  ├─ current route and query params
│  ├─ intended return route
│  └─ active modal/sheet/dialog when safe to restore
├─ Reader
│  ├─ open book IDs and active book
│  ├─ reader location/progress
│  ├─ selection/annotation/note draft when safe
│  ├─ notebook/AI draft
│  └─ TTS/RSVP state as restorable or intentionally stopped
├─ Library/catalog
│  ├─ current collection/filter/sort/search
│  ├─ import/download in-progress marker
│  └─ selected items if safe
├─ Settings
│  ├─ app settings
│  ├─ per-book reader settings
│  └─ native UI/safe-area assumptions as non-authoritative hints
└─ Sync/recovery
   ├─ pending sync queue metadata
   ├─ last successful sync marker
   ├─ app/build/schema version
   └─ migration/recovery status
```

#### QA baseline for update continuity

- [ ] User can tell whether the update is web, PWA, direct native, store native, backend, package, or plugin.
- [ ] User sees an update prompt only at a safe point, or can defer it.
- [ ] User state is checkpointed before reload/relaunch/install.
- [ ] Reader reopens to the same book/location after reload/relaunch when compatible.
- [ ] Unsaved note/AI/settings drafts are restored or explicitly not restored with clear messaging.
- [ ] Ongoing TTS/RSVP/import/download/sync either resumes safely or stops with recoverable state.
- [ ] Old client and new backend remain compatible during rolling deploy.
- [ ] PWA/service-worker update does not trap the user on stale assets or a blank page.
- [ ] Store builds do not expose direct updater promises they cannot fulfill.
- [ ] Direct native builds verify signatures/checksums before install and recover safely from failed update.
- [ ] macOS/Windows direct desktop update flow can show `Update ready`, checkpoint state on click, relaunch/update, and restore the previous task when compatible.

<a id="current-distribution-structure"></a>

### Current distribution structure

Use this as a current-state map, not as a release promise. Each surface is split into user access, repo/build structure, release/update model, and watch items so the section stays readable in Markdown viewers.

```txt
Current distribution structure
├─ User-facing app surfaces
│  ├─ Web desktop
│  ├─ Mobile web
│  ├─ PWA install
│  ├─ macOS direct desktop
│  ├─ macOS App Store
│  ├─ Windows desktop
│  ├─ Linux desktop
│  ├─ iOS native
│  └─ Android native
├─ Backend/service surfaces
│  ├─ Standalone API
│  └─ Storage/CDN/download assets
└─ Integration/package surfaces
   ├─ MCP server
   ├─ TypeScript SDK
   └─ KOReader plugin source (deprecated; not distributed in current releases)
```

#### Web desktop

- User access: `https://app.openread.ai` in desktop browsers.
- Repo/build structure: `vercel.json` builds `@openread/openread-app` with `build-web`; `next.config.mjs` runs as a normal Next app when `NEXT_PUBLIC_APP_PLATFORM=web`.
- Release/update model: Vercel deployment from `main`; users receive the hosted build by refresh/navigation.
- Watch items: Cloudflare/OpenNext deployment config also exists in `apps/openread-app/wrangler.toml`; source-of-truth domain, rollback path, and fallback role need explicit release docs.

#### Mobile web

- User access: same web URL in iOS Safari / Android Chrome.
- Repo/build structure: same web app with responsive UI and web platform guards.
- Release/update model: same hosted web deployment; mobile browser cache and service-worker behavior can affect rollout timing.
- Watch items: do not confuse mobile web with native mobile; it has no native UIKit footer, Android Back bridge, native file/import bridge, or store IAP behavior.

#### PWA install

- User access: browser install / Add to Home Screen from the web app.
- Repo/build structure: `public/manifest.json`; Serwist service worker enabled only when `NEXT_PUBLIC_APP_PLATFORM=web` and not dev.
- Release/update model: web deployment plus service-worker update lifecycle.
- Watch items: offline/PWA guarantees are not fully documented here yet; installability, cache refresh, and stale-service-worker recovery need explicit QA.

#### macOS direct desktop

- User access: user installs a DMG or direct release artifact.
- Repo/build structure: Tauri config bundles static `../out`; script `build-macos-universial` builds a universal DMG; Tauri updater artifacts are enabled.
- Release/update model: Tauri updater, release notes, and downloadable artifacts use public R2 at `releases.openread.ai`.
- Watch items: script name typo `universial`; direct-download landing page/path is not documented in this baseline.

#### macOS App Store

- User access: Apple App Store link shown in updater/about UI.
- Repo/build structure: scripts reference `build-macos-universial-appstore` and `scripts/release-mac-appstore.sh`.
- Release/update model: App Store Connect upload via `xcrun altool`; store updates handled by Apple.
- Watch items: referenced `src-tauri/tauri.appstore.conf.json` and dev variant are not present in this worktree; `NEXT_PUBLIC_DIST_CHANNEL=appstore` behavior needs a release checklist.

#### Windows desktop

- User access: NSIS installer or portable `.exe` release artifact.
- Repo/build structure: Tauri config targets Windows with WebView2 bootstrapper; scripts build NSIS; portable updater path exists in `UpdaterWindow`.
- Release/update model: installed and portable app updates use public R2 at `releases.openread.ai`.
- Watch items: `build-win-x64` currently targets `i686-pc-windows-msvc`, not `x86_64`; explicit Windows x64 release path needs verification.

#### Linux desktop

- User access: possible AppImage user access if released.
- Repo/build structure: script `build-linux-x64`; updater code supports AppImage download and relaunch.
- Release/update model: direct AppImage artifacts use public R2 at `releases.openread.ai`.
- Watch items: Linux is code-supported in places but not listed as a primary supported product platform in this baseline; support level and QA ownership are unknown.

#### iOS native

- User access: App Store, TestFlight, or device-installed build.
- Repo/build structure: Tauri iOS build scripts; `Info-ios.plist` registers `openread://`; `apple-app-site-association` declares `/auth/*` app links.
- Release/update model: `build-ios-appstore` / `release-ios-appstore.sh` upload to App Store Connect; iOS app updater is disabled and users are sent to App Store/release notes.
- Watch items: `apple-app-site-association` appID team prefix differs from `tauri.conf.json` development team and needs verification; App Store channel disables online catalogs and external directory access in code.

#### Android native

- User access: Google Play, direct APK, or test build.
- Repo/build structure: Tauri Android build; Google Play release script; `assetlinks.json` points to `com.reglity.openread`; Android native bridge handles auth callback and device keys.
- Release/update model: Google Play via `release-google-play.sh` + fastlane; non-store Android updates use public R2 release assets.
- Watch items: referenced `src-tauri/tauri.playstore.conf.json` is not present in this worktree; release script mutates generated manifest permissions; Play Store vs sideload updater behavior must be separated.

#### Standalone API

- User access: app, MCP, SDK, and integrations call backend APIs indirectly.
- Repo/build structure: `apps/api` Hono service has Dockerfile and `fly.toml`; web app also has Next API routes under `apps/openread-app/src/app/api`.
- Release/update model: Fly.io for `api.openread.ai`; Vercel/Next routes for app-domain APIs.
- Watch items: API surface is split between standalone Hono and Next routes; API versioning and client compatibility need explicit distribution policy.

#### Storage/CDN/download assets

- User access: indirect access through app downloads, book files, covers, updates, and release notes.
- Repo/build structure: `openread-books` remains private behind signed S3-compatible URLs; `openread-releases` serves public artifacts through `releases.openread.ai`.
- Release/update model: release assets are built on a published release in the private `platform` repository, then manifests and artifacts are published to public R2.
- Watch items: release artifact manifests remain required for macOS, Windows, Linux, Android, updater JSON, signatures, checksums, and release notes JSON.

#### MCP server

- User access: AI client config with `npx -y @openread/mcp` and an `orsk-` API key.
- Repo/build structure: `packages/mcp` is a public npm package with CLI bin; README points users to Settings > API Keys.
- Release/update model: npm package release; clients keep the installed/resolved package until updated.
- Watch items: package metadata says MIT while README says AGPL-3.0; package is `0.0.1-test.9`; unversioned API compatibility is a distribution risk.

#### TypeScript SDK

- User access: developer installs `@openread/sdk`.
- Repo/build structure: `packages/sdk` is a public npm-oriented package with dist exports and `publishConfig.access=public`.
- Release/update model: npm package release.
- Watch items: current publish status, version policy, and API compatibility guarantees need audit.

#### KOReader plugin

- User access: deprecated; no current release-distributed plugin install path.
- Repo/build structure: legacy source remains under `apps/openread.koplugin` with Lua plugin files.
- Release/update model: excluded from `.github/workflows/release.yml`; no KOReader plugin zip is generated, attached, checksummed, or mirrored to R2 for current releases.
- Watch items: if KOReader plugin distribution is revived, restore an explicit release asset job, add it to checksum/R2 gates, and document packaging, install instructions, compatibility matrix, and ownership before shipping.

<a id="cicd-and-release-process"></a>

### CI/CD and release process

CI/CD should account for two different flows: continuous delivery for hosted services and explicit release publishing for user-installed artifacts.

```txt
CI/CD and distribution flow
├─ 1. PR validation
│  ├─ Web app: format, lint, tests, typecheck, build-web, build-tauri static export
│  ├─ Rust/Tauri: cargo fmt and clippy
│  ├─ API: typecheck, tests, build, Docker build validation
│  └─ MCP: typecheck, tests, bundle, package-size validation
├─ 2. Main branch integration
│  ├─ CI reruns broad build/test/license/security checks
│  ├─ Vercel deploys web app from main using vercel.json
│  ├─ API deploy workflow builds/pushes container and deploys to Fly.io when API paths change
│  └─ Public reader mirror syncs open-source subset when relevant paths change
├─ 3. Explicit product release
│  ├─ GitHub release published or manual release workflow dispatch
│  ├─ Native matrix builds Android, Linux, macOS, Windows artifacts
│  ├─ latest.json, release-notes.json, signatures, and checksums are attached
│  └─ KOReader plugin zip is deprecated and intentionally not produced
├─ 4. Store release paths
│  ├─ macOS App Store upload uses app-store-specific script/config
│  ├─ iOS App Store upload uses Tauri iOS App Store export + altool
│  └─ Google Play upload uses Play Store config + fastlane
├─ 5. Package release paths
│  ├─ MCP publishes to npm from mcp@* tags
│  └─ SDK publish path is not yet documented in current workflows
└─ 6. Post-release validation
   ├─ Hosted URLs health/smoke checks
   ├─ Public R2 latest.json and representative asset smoke checks
   ├─ Store/direct update checks
   ├─ Native deep-link/auth callback checks
   └─ Rollback/communication decision if validation fails
```

<a id="current-cicd-workflow-inventory"></a>

### Current CI/CD workflow inventory

Use this as a current-state workflow map. Each workflow is split into trigger, purpose, distribution effect, and watch items so it remains readable in Markdown viewers.

```txt
Current CI/CD workflow inventory
├─ Validation workflows
│  ├─ Pull request checks
│  └─ Main/branch CI
├─ Hosted deployment workflows
│  ├─ Vercel web deploy
│  └─ Fly.io API deploy
├─ Release artifact workflows
│  ├─ Openread release workflow
│  └─ Upload release assets to R2
├─ Package/mirror workflows
│  ├─ Publish MCP server
│  └─ Sync public reader mirror
└─ Manual or external release paths
   ├─ Store release scripts
   └─ Cloudflare/OpenNext scripts
```

#### Pull request checks

- Workflow: `.github/workflows/pull-request.yml`
- Trigger: pull requests targeting `main`.
- Purpose: PR gate for Rust/Tauri format and clippy, web/tauri builds, tests, lint, API build, and API Docker validation.
- Distribution effect: blocks unsafe merges before any production or release distribution path.
- Watch items: does not run full native artifact builds or store packaging; native distribution remains release/manual.

#### Main/branch CI

- Workflow: `.github/workflows/ci.yml`
- Trigger: pushes to `main` and `epic/*`; pull requests targeting `main`.
- Purpose: broad CI for format, lint, typecheck, tests, build-web, build checks, license check, MCP validation, API validation, and security audit.
- Distribution effect: confirms merged code remains buildable; not itself a release except as an upstream signal for hosted deploys.
- Watch items: security audit currently has an informational `continue-on-error` due pnpm audit endpoint issue.

#### Vercel web deploy

- Workflow/config: external Vercel project using `vercel.json`.
- Trigger: Vercel integration on `main`.
- Purpose: installs dependencies/vendors and runs `pnpm --filter @openread/openread-app build-web`.
- Distribution effect: publishes hosted web app at `app.openread.ai`.
- Watch items: deployment is not represented as a GitHub Actions workflow here; production status, preview links, rollback evidence, and failed-deploy evidence must be captured from Vercel.

#### Fly.io API deploy

- Workflow: `.github/workflows/deploy-api.yml`
- Trigger: separately authorized manual dispatch only; no push-triggered production deploy.
- Purpose: validates one exact current-`main` SHA and primary-schema state, deploys only `openread-api`, proves the public edge serves the target revision with database and private Catalog connectivity, and restores the incumbent immutable image plus semantic Machine configuration if deployment or validation fails.
- Distribution effect: updates the public API consumer. The private producer is independently deployed from `openread-ai/openread-catalog`; Platform cannot mutate it.
- Watch items: the canonical pre-live gate is manual `workflow_dispatch` from `main`, one exact current-`main` SHA, and the explicit deployment confirmation before Fly access. Only the deploy job uses `environment: production`, strictly for the canonical app-scoped `FLY_API_TOKEN`. The workflow rejects indeterminate Catalog-access probes, requires classified authorization denial, pins external actions and flyctl, snapshots both incumbent Machines with immutable digests, and validates complete rollback semantics plus public revision/readiness. A runner or provider failure that prevents rollback proof blocks retry until read-only incident evidence and new authorization are recorded. Vercel's independent `main` auto-deploy remains a distinct authorization-control gap.

#### Openread release workflow

- Workflow: `.github/workflows/release.yml`
- Trigger: GitHub Release published, or manual dispatch.
- Purpose: updates release notes, builds native artifacts, signs artifacts, updates `latest.json`, uploads release notes, generates checksums, and calls R2 upload.
- Distribution effect: stages artifacts on a published release in the private `platform` repository, then publishes direct/native update assets through `releases.openread.ai`.
- Deprecated/excluded assets: KOReader plugin zip distribution is deprecated; the release workflow intentionally does not build, attach, checksum, or mirror `*.koplugin.zip` assets.
- Watch items: if a new release asset-producing job is added, include it in the `generate-checksums` dependency boundary before relying on native release automation.

#### Publish MCP server

- Workflow: `.github/workflows/publish-mcp.yml`
- Trigger: tags matching `mcp@*`.
- Purpose: validates MCP bundle, checks package size, publishes npm package with provenance, verifies `npx @openread/mcp@<version> --version`, and creates a GitHub release.
- Distribution effect: publishes `@openread/mcp` for AI clients.
- Watch items: MCP package/API compatibility policy must be enforced before tag; package license mismatch remains a distribution risk.

#### Sync public reader mirror

- Workflow: `.github/workflows/sync-public-reader.yml`
- Trigger: pushes to `main` affecting open-source reader paths, or manual dispatch.
- Purpose: copies and strips the open-source reader subset into the public mirror repository.
- Distribution effect: updates public/open-source reader repository.
- Watch items: stripping logic is complex; mirror correctness and license boundary should be release-checked.

#### Store release scripts

- Workflow/config: manual scripts such as `scripts/release-mac-appstore.sh`, `scripts/release-ios-appstore.sh`, and `scripts/release-google-play.sh`.
- Trigger: manual command/script execution.
- Purpose: upload macOS, iOS, and Google Play builds using App Store Connect or fastlane.
- Distribution effect: publishes app-store and mobile-store builds.
- Watch items: store configs appear local/missing in this worktree; CI coverage for store uploads is not currently represented as a GitHub workflow.

#### Cloudflare/OpenNext scripts

- Workflow/config: package scripts using OpenNext/Cloudflare and `apps/openread-app/wrangler.toml`.
- Trigger: manual package scripts.
- Purpose: build and deploy the web app to Cloudflare Workers routes.
- Distribution effect: potential alternate or fallback web distribution.
- Watch items: no GitHub workflow currently documents when Cloudflare deploy is production, staging, fallback, legacy, or experimental.

<a id="required-cicd-accounting-gates"></a>

### Required CI/CD accounting gates

Every future feature or deployment should declare which gates it touches and which distribution paths need validation.

Use these gates to decide what evidence must exist before a feature is merged, released, or handed off.

```txt
Required CI/CD accounting gates
├─ PR gate
├─ Hosted web gate
├─ API gate
├─ Native direct-release gate
├─ Store-release gate
├─ Package-release gate
├─ Public mirror gate
└─ Rollback / incident gate
```

#### PR gate

- Required accounting: identify changed product surfaces, required platform lanes, required tests, and whether native/store/manual checks are intentionally skipped.

#### Hosted web gate

- Required accounting: confirm Vercel deployment status, `app.openread.ai` smoke, PWA/service-worker update behavior when relevant, and browser cache expectations.

#### API gate

- Required accounting: confirm API Docker build/deploy, Fly health, public `api.openread.ai` health, database/storage/env compatibility, and rollback path.

#### Native direct-release gate

- Required accounting: confirm release artifact names, architectures, signatures, `latest.json` platform keys, `release-notes.json`, checksums, public R2 upload, unauthenticated download smoke, and updater behavior.

#### Store-release gate

- Required accounting: confirm store-specific configs, signing/provisioning, IAP/subscription behavior, app links/auth callback, review restrictions, and store update path.

#### Package-release gate

- Required accounting: confirm package version/tag, npm publish provenance, install command, API compatibility, package size, license metadata, and post-publish smoke.

#### Public mirror gate

- Required accounting: confirm stripped mirror builds, license boundaries, removed proprietary code, and public docs/readme correctness.

#### Rollback / incident gate

- Required accounting: identify rollback owner, fastest rollback method, whether feature flag exists, user communication needs, and whether data/schema migrations are reversible.

Required CI/CD notes per feature baseline:

- [ ] Which distribution paths does this feature reach: web, PWA, desktop, mobile native, API, MCP, SDK, public mirror, or store-only?
- [ ] Which workflow proves it before merge?
- [ ] Which workflow publishes it after merge?
- [ ] Which environment variables/secrets/signing keys are required?
- [ ] Which artifacts should exist after release?
- [ ] Which hosted URLs or store links should users use?
- [ ] Which updater/store/PWA cache path should deliver the next version?
- [ ] What is the rollback path if the release is bad?

<a id="distribution-gaps-and-watch-items"></a>

### Distribution gaps and watch items

- [ ] Decide and document canonical web hosting: Vercel `app.openread.ai` vs Cloudflare/OpenNext routes in `wrangler.toml`.
- [ ] Document whether Cloudflare web routes are production, staging, fallback, legacy, or experimental.
- [ ] Add a release artifact manifest for each native channel: expected file names, architectures, updater JSON keys, signatures/notarization, and store-upload outputs.
- [ ] Fix or validate `.github/workflows/release.yml` dependency wiring for checksum generation before relying on native release automation.
- [ ] Resolve missing or local-only Tauri store configs referenced by scripts: `tauri.appstore.conf.json`, `tauri.appstore-dev.conf.json`, and `tauri.playstore.conf.json`.
- [ ] Verify Apple app association identifiers: `apple-app-site-association` appID prefix vs Tauri/iOS signing team.
- [ ] Separate store vs direct-download behavior in docs: App Store/Google Play builds should not imply the same updater/file-access behavior as direct builds.
- [ ] Verify Windows build architecture naming: `build-win-x64` currently uses the `i686-pc-windows-msvc` target.
- [ ] Decide whether Linux/AppImage is an officially supported platform or an unofficial artifact.
- [ ] Document how users discover/download desktop builds: website download page, GitHub releases, App Store, Microsoft Store, or direct CDN.
- [ ] Document PWA install/update/offline behavior and what users should expect after deployment.
- [ ] Document API versioning and compatibility policy for web app, native apps, MCP, SDK, and third-party clients.
- [ ] Resolve MCP license metadata mismatch between `packages/mcp/package.json` and `packages/mcp/README.md`.
- [ ] Add distribution-specific QA checks for deep links, universal/app links, file associations, auth callback, updater, IAP, and store restrictions.

<a id="3-global-app-flows"></a>

## 3. Global app flows

<a id="app-launch-and-shell"></a>

### App launch and shell

Status: `Unknown / needs audit`

```txt
App launch and shell
├─ Current state
├─ Entry points
├─ Platform behavior
├─ Wiring notes
├─ Inconsistencies / watch items
├─ QA baseline
└─ Implementation references
```

<a id="authsession-state"></a>

### Auth/session state

Status: `Unknown / needs audit`

```txt
Auth/session state
├─ Current state
├─ Signed-out flows
├─ Signed-in flows
├─ OAuth/email/provider behavior
├─ Tier and quota effects
├─ Platform behavior
├─ Inconsistencies / watch items
├─ QA baseline
└─ Implementation references
```

<a id="navigation-and-routing"></a>

### Navigation and routing

Status: `Unknown / needs audit`

```txt
Navigation and routing
├─ Current state
├─ Route/deep-link forms
├─ Back/close behavior
├─ External link behavior
├─ Platform behavior
├─ Routing/deep-link risks
├─ QA baseline
└─ Implementation references
```

<a id="offlineonline-behavior"></a>

### Offline/online behavior

Status: `Unknown / needs audit`

```txt
Offline/online behavior
├─ Current state
├─ Cached data behavior
├─ Sync retry behavior
├─ Error/recovery behavior
├─ Platform behavior
├─ Inconsistencies / watch items
├─ QA baseline
└─ Implementation references
```

<a id="sync-state"></a>

### Sync state

Status: `Unknown / needs audit`

```txt
Sync state
├─ Current state
├─ Book progress sync
├─ Library/catalog sync
├─ Annotation/note sync
├─ Conflict behavior
├─ Platform behavior
├─ Inconsistencies / watch items
├─ QA baseline
└─ Implementation references
```

<a id="errorrecovery-behavior"></a>

### Error/recovery behavior

Status: `Unknown / needs audit`

```txt
Error/recovery behavior
├─ Current state
├─ Recoverable errors
├─ Fatal/blank-state risks
├─ Toast/dialog behavior
├─ Data-loss prevention
├─ Platform behavior
├─ QA baseline
└─ Implementation references
```

<a id="4-feature-baselines"></a>

## 4. Feature baselines

Each feature should use this shape:

```txt
Feature Name
├─ Current state
├─ User workflows
├─ Controls and entry points
├─ Platform behavior
├─ Data/state/persistence
├─ Wiring notes
├─ Inconsistencies / watch items
├─ QA baseline
└─ Implementation references
```

<a id="41-library"></a>

### 4.1 Library

Status: `Unknown / needs audit`

```txt
Library
├─ Current state
├─ User workflows
│  ├─ Load library
│  ├─ Search/filter/sort/group
│  ├─ Open book
│  ├─ Import/add book
│  ├─ Remove/delete book
│  └─ Empty/error states
├─ Controls and entry points
├─ Platform behavior
├─ Data/state/persistence
├─ Wiring notes
├─ Inconsistencies / watch items
├─ QA baseline
└─ Implementation references
```

<a id="42-reader"></a>

### 4.2 Reader

Status: `Current inventory merged`

Reader is now reconciled into this canonical baseline. The standalone `reader-manual-qa-checklist.md` file has been removed; derived testing docs should link to this section instead of duplicating reader behavior.

```txt
Reader
├─ Current state
├─ User workflows
│  ├─ Open from Library/Catalog/search/deep link
│  ├─ Read and navigate
│  ├─ Search within book
│  ├─ Annotate/highlight/note
│  ├─ Use AI/chat/notebook
│  ├─ Use TTS/RSVP/paragraph mode
│  ├─ Change settings
│  ├─ Multi-book / parallel read
│  └─ Close/return/reload/recover
├─ Controls and entry points
│  ├─ Header controls
│  ├─ View menu
│  ├─ Footer/navigation controls
│  ├─ Sidebar/book menu/search
│  ├─ Notebook/AI surfaces
│  ├─ Selection/context menus
│  ├─ Settings dialogs/sheets
│  ├─ Keyboard shortcuts
│  └─ Native platform controls
├─ Platform behavior
│  ├─ Web desktop
│  ├─ Mobile web
│  ├─ macOS/Windows Tauri
│  ├─ iOS native
│  └─ Android native
├─ Data/state/persistence
│  ├─ Progress/location
│  ├─ Book settings
│  ├─ Bookmarks
│  ├─ Annotations/notes
│  ├─ AI conversations
│  └─ Search/TTS/translation state
├─ Wiring notes
│  ├─ Reader route forms
│  ├─ Multi-book IDs and duplicate-book handling
│  ├─ Active book vs primary book state
│  ├─ Native bridge messages
│  ├─ Sidebar/notebook/footer state
│  └─ TTS/selection/annotation callbacks
├─ Inconsistencies / watch items
├─ QA baseline
└─ Implementation references
```

#### Current state

- [ ] Release-facing QA follows [Launch State](../ops/launch-state.md); implementation inventory below remains for regression awareness.
- [ ] Reader supports web desktop, mobile web, desktop Tauri, iOS native, and Android native surfaces with significant platform-specific UI differences.
- [ ] Reader supports direct route/deep-link entry, library/catalog/search entry, multi-book/parallel-read entry, and external/local-file entry on native desktop where available.
- [ ] Reader current-state validation must include route behavior, chrome visibility, controls, native bridges, duplicate labels, known watch items, and evidence per platform.

#### Canonical reconciliation rule

- [ ] Reader details live here as the canonical source of truth.
- [ ] Derived QA docs may link to this section but should not duplicate detailed reader behavior.
- [ ] Any future reader feature, platform behavior, or known issue should update this section first.

#### Current implementation control ledger

Use this ledger as the source-backed inventory before marking the Reader goal complete. Each entry must remain aligned with the implementation references listed here.

```txt
Reader current controls
├─ Routing and deep links
├─ Header and view menu
├─ Footer, navigation, and overlays
├─ Sidebar, search, and book menu
├─ Notebook and AI chat
├─ Selection, annotations, export, and reference popups
├─ TTS, RSVP, and paragraph mode
├─ Settings dialog and mobile settings sheets
├─ Native iOS / Android / desktop bridges
└─ Shortcuts and hardware buttons
```

##### Routing and deep-link control ledger

- [ ] `navigateToReader` uses `/reader/<ids>` on web non-PWA and `/reader?ids=<encodedIds>` on PWA/Tauri, preserving optional query params.
- [ ] `showReaderWindow` opens a separate Tauri reader window with query-style `/reader?ids=<encodedIds>`, `reader-*` labels, platform-specific title/decorations, and independent close behavior.
- [ ] `ReaderContent` parses route IDs in this precedence order: `ids` prop, `?ids=`, then `/reader/<ids>` path segment.
- [ ] Raw `+` separators are safe in path-style `/reader/<ids>`; query-style links should encode the separator as `%2B` because form query decoding treats raw `+` as a space.
- [ ] Multiple IDs are split by `BOOK_IDS_SEPARATOR` after route/query decoding; duplicate IDs create separate `bookKey` instances while only the first instance of a hash is primary.
- [ ] `ActivityCaptureBridge` handles `openread://activity-capture?...` targets; reader targets open the first local library book or fall back to Library when no local book is available.
- [ ] `parseOpenWithFiles` handles `?file=`, CLI `file1`-`file4`, `file://`, and `content://` open-with inputs; it intentionally ignores activity-capture and non-file URLs.
- [ ] AI citation links use `openread://loc/<offset>` inside Markdown, are intercepted in the reader, and dispatch `navigate-to-offset` rather than launching the OS deep-link handler.
- [ ] Custom `openread` scheme registration exists on desktop and iOS; direct `openread://reader?ids=...` reader-ID routing is not currently implemented unless added later.

##### Header and view-menu control ledger

- [ ] Desktop header controls: Toggle Sidebar, Add/Remove Bookmark, Toggle Translation, optional Quick Action dropdown, Font & Layout, Notebook, View Options, and Tauri window buttons where native decorations are absent.
- [ ] Mobile header controls: Back to Library, truncated title, iOS Search, iOS Reading Progress, Bookmark, non-iOS AI Chat, and More Options.
- [ ] Quick Action header labels distinguish `Enable Quick Action on Selection` from `Disable Quick Action` when an action is active.
- [ ] Quick Action dropdown items: Instant Highlight, Instant Search, Instant Dictionary, Instant Wikipedia, Instant Translate, Instant Speak; reselecting the active item disables it.
- [ ] Quick Action disabled toast uses `Instant {{action}} Disabled` and should name the disabled action.
- [ ] View Options fixed-layout controls: Zoom Out, Reset Zoom, Zoom In, Single Page, Auto Spread, Fit Page, Fit Width, and Separate Cover Page.
- [ ] View Options general controls: Font & Layout, Scrolled Mode, Paragraph Mode, Speed Reading Mode, Sync/Sign in to Sync, Fullscreen, theme-mode cycle, and Invert Image in Dark Mode.
- [ ] View Options sync labels switch between `Sign in to Sync`, `Never synced`, and `Synced at {{time}}` depending on auth/sync state.
- [ ] View Options iOS-only controls: Read Aloud, Translation, AI Chat, and Book Info.

##### Footer, navigation, and overlay control ledger

- [ ] Desktop footer controls: Previous Section, Previous Page, Go Back, Go Forward, progress text, Jump to Location slider, Speak, Next Page, and Next Section.
- [ ] Reader margin ProgressInfo surface shows remaining time/pages and progress, exposes an aria label, and cycles all/remaining/progress/none modes when Tap to Toggle Footer is enabled.
- [ ] Non-iOS mobile footer tabs: Table of Contents, Color, Reading Progress, Font & Layout, and Speak.
- [ ] Non-iOS mobile Color panel controls: Screen Brightness when supported, theme color buttons, and Auto/Light/Dark theme cycle.
- [ ] Non-iOS mobile Progress panel controls: progress slider, Previous/Next Section, Previous/Next Page, Go Back, and Go Forward.
- [ ] Non-iOS mobile Font & Layout controls: Font Size, Page Margin, and Line Spacing sliders.
- [ ] iOS native footer controls: native UITabBar TOC, Chat, and Settings items; active-tab tap deselects; inactive-tab tap switches half-sheet content.
- [ ] iOS progress overlay controls: Reading Progress slider, Previous/Next Section, Previous/Next Page, Go Back, Go Forward, auto-hide timer, and touch timer reset.
- [ ] HalfSheet controls: overlay tap closes, drag handle dismisses or expands, expanded back button closes, and haptic feedback fires where supported.

##### Sidebar, search, and book-menu control ledger

- [ ] Sidebar header controls: mobile Close, desktop Go to Library, Show/Hide Search Bar, Book Menu, Pin/Unpin Sidebar, resize slider/drag handles, and overlay dismiss.
- [ ] Book card control: More Info opens Book Details.
- [ ] Book Menu visible controls: Parallel Read submenu, Enter Parallel Read, Exit Parallel Read, Export Annotations, Sort TOC by Page, and Reload Page.
- [ ] Book Menu disabled/commented controls are not visible: KOReader Sync, Push/Pull Progress, Show on Discord, Proofread, Download Openread, About Openread.
- [ ] Mounted but unreachable/hidden reader dialogs remain tracked: KOReader Sync Settings, Proofread Replacement Rules, About Openread, and Updater window.
- [ ] KOReader auto-conflict dialog controls: Sync Conflict, Local Progress, Remote Progress, close, and preview text for current/remote progress.
- [ ] Search bar controls: mobile Back/Close, input, Clear search, Search Options dropdown, history chips, and Clear search history.
- [ ] Search options: Book, Chapter, Match Case, Match Whole Words, and Match Diacritics.
- [ ] Search results controls: result row click/Enter/Space, progress bar while searching, Show Search Results, Previous Result, Next Result, and Close Search.
- [ ] Sidebar tabs: TOC, Annotate, Bookmark, and Chat when AI is enabled.
- [ ] TOC controls: tree item click/Enter, nested expander, active-item highlight, sorted-by-page mode.
- [ ] Booknote controls: annotation/bookmark row click/Enter/Space, Edit, Delete, inline bookmark Cancel/Save, Booknotes nav Show Results/Previous/Next/Close.
- [ ] Chat history controls: Recents list, New Chat, conversation row select, multi-book count badge/hover card, More options, Delete, and delete confirmation.

##### Notebook and AI chat control ledger

- [ ] Notebook header controls: Pin/Unpin Notebook, mobile Close, Show/Hide Search Bar on Notes, and New Chat on AI.
- [ ] Notebook body controls: Resize Notebook slider/drag handle, Notes/AI tab bar, search notes/excerpts input, clear search, note/excerpt rows, and overlay dismiss when unpinned.
- [ ] Note editor controls: text editor, Add your notes placeholder, Cancel, Save, Ctrl+Enter save, and Escape cancel.
- [ ] Excerpt controls: expand/collapse row, Delete button, and Delete/Backspace shortcut on focused excerpt.
- [ ] AI Thread controls: desktop New Chat, Select Model when BYOK provider is active, Scroll to bottom, composer input, Send message, Cancel response, and native iOS composer bridge.
- [ ] AI assistant message controls: branch Previous/Next picker, Regenerate/Reload, Copy, and citation links (`openread://loc/<offset>`) that navigate the reader.
- [ ] AI user message controls: Edit, Copy, edit composer Cancel, and Update.
- [ ] AI model picker controls: search models input, model row select, selected checkmark, fetch fallback/error state, outside-click close, and optional Manage providers footer.
- [ ] AI limit controls: LimitReachedCard Upgrade, Dismiss, Use boost/Add boost when handlers are wired, quota counter, disabled composer, and iOS native composer disabled state.

##### Selection, annotations, export, and reference-popup control ledger

- [ ] Selection popup actions: Copy, Highlight/Delete Highlight, Annotate, Search, Dictionary, Wikipedia, Translate, Speak, and Proofread.
- [ ] Highlight options: styles Highlight, Underline, Squiggly; colors Red, Violet, Blue, Green, Yellow, plus user custom colors; active style/color checkmark.
- [ ] Annotation notes popup: existing-note cards show note text and age and open the Annotation sidebar on click.
- [ ] Export Annotations dialog controls: Format Options checkboxes Title, Author, Export Date, Chapter Titles, Chapter Separator, Highlights, Notes, and Note Date.
- [ ] Export Advanced controls: Show/Hide, Use Custom Template, Export Template textarea, Reset Template, Template Syntax, Available Variables, Date Format Tokens, Preview, Show Source, Cancel, and Export.
- [ ] Translator popup controls: Original Text source selector with Auto Detect, Translated Text target selector, provider selector, loading/error states, and Login Required/Quota Exceeded provider labels.
- [ ] Wiktionary popup controls: definition links can trigger another lookup, Source footer appears on loaded state, and error fallback links to Wiktionary.
- [ ] Wikipedia popup controls: summary content/source footer appears on loaded state and error fallback links to Wikipedia.
- [ ] Proofread popup controls: replacement input, Apply, Case sensitive, Whole word, Only for TTS, Scope selector (`Current selection`, `All occurrences in this book`, `All occurrences in your library`), Enter-to-apply, and whole-word warning.
- [ ] Proofread Replacement Rules manager is mounted but the Book Menu entry is currently disabled/commented; if invoked, controls include Selected Text Rules, Book Specific Rules, Edit, Delete, replacement input, Save, Cancel, and selection navigation for selection-scoped rules.

##### TTS, RSVP, and paragraph-mode control ledger

- [ ] TTS entry controls: footer Speak, mobile Speak tab, iOS Read Aloud, `t` shortcut, selection Speak, and media-session actions.
- [ ] TTS floating icon opens panel and hides on timeout; overlay/outside dismiss closes the panel.
- [ ] TTS panel controls: rate slider with Slow/1.0/1.5/2.0/Fast markers, Previous Paragraph, Play/Pause, Next Paragraph, Set Timeout, Select Voice, and Toggle Sticky Bottom TTS Bar.
- [ ] TTS timeout options: No Timeout, 1/3/5/10/20/30/45 minutes, and 1/2/3/4/6/8 hours with countdown badge.
- [ ] TTS voice controls: voice engine groups, per-voice select, selected checkmark, disabled voice styling, no-voices state.
- [ ] Sticky TTS bar controls: Previous Paragraph, Previous Sentence, Play/Pause, Next Sentence, and Next Paragraph.
- [ ] RSVP start dialog controls: From Chapter Start, Resume, From Current Page, From Selection, and Cancel.
- [ ] RSVP overlay controls: Close, chapter dropdown and chapter rows, progress seek bar, Back/Forward 15 words, Play/Pause, punctuation pause select, decrease/increase speed, context panel, countdown, touch tap zones, and horizontal swipe speed changes.
- [ ] Paragraph bar controls: Previous Paragraph, Next Paragraph, Exit Paragraph Mode, loading state, and paragraph overlay keyboard/wheel/touch/click navigation.

##### Settings and mobile-settings control ledger

- [ ] Settings shell controls: tabs Font/Layout/Color/Behavior/Language/Custom, mobile back/Close, desktop Close, Search Settings, Settings Menu, Global Settings toggle, Reset current panel, Clear Custom Fonts, and Manage Custom Fonts.
- [ ] Shared numeric controls expose Increase/Decrease behavior and min/max/step boundaries.
- [ ] Font panel controls: Override Book Font, Default Font Size, Minimum Font Size, Font Weight, Default Font, CJK Font, Manage Custom Fonts, Serif Font, Sans-Serif Font, Monospace Font, System Fonts, and custom font import/select/delete/clear.
- [ ] Layout panel controls: Override Book Layout, Writing Mode Default/Horizontal/Vertical/RTL, Border Frame Double Border/Red/Black, paragraph numeric controls, page margin numeric controls, Header & Footer toggles, Reading Progress Style Page Number/Percentage, Tap to Toggle Footer, scrolled-mode apply toggles, and Orientation Auto/Portrait/Landscape.
- [ ] Color panel controls: Theme Mode Auto/Light/Dark, Invert Image, Override Book Color, Theme Color selection, Custom theme create/edit/save/delete/cancel, Background Image select/import/delete, Opacity, Size Auto/Cover/Contain, Highlight Colors, TTS Highlighting, Reading Ruler, and Code Highlighting.
- [ ] Highlight Colors editor controls: default Red/Violet/Blue/Green/Yellow color inputs, custom color picker, Add, custom color edit, and Delete.
- [ ] TTS Highlighting controls: Style Highlighter/Underline/Strikethrough/Squiggly/Outline, Color input, Save Current Color, Quick Colors Gold/Cyan/Pink/Green/Orange, custom color select/delete.
- [ ] Reading Ruler controls: Enable Reading Ruler, Lines to Highlight, Ruler Color Transparent/Yellow/Green/Blue/Rose, and Opacity.
- [ ] Code Highlighting controls: Enable Highlighting and Code Language including Auto.
- [ ] Language panel controls: Interface Language, Enable Translation, Show Source Text, TTS Text Source and Translated/Translated Only/Source Only, Translation Service, Translate To, Replace Quotation Marks, and Convert Mode.
- [ ] Chinese conversion options: No Conversion, Simplified to Traditional, Traditional to Simplified, Simplified to Traditional (Taiwan), Simplified to Traditional (Hong Kong), Simplified to Traditional (Taiwan) with phrases, Traditional (Taiwan) to Simplified, Traditional (Hong Kong) to Simplified, and Traditional (Taiwan) to Simplified with phrases.
- [ ] Custom panel controls: Custom Content CSS textarea, Custom Reader UI CSS textarea, Apply button only when changed and valid, validation error display, reset behavior, and Android input-focus scrolling.
- [ ] iOS/native Settings sheet controls: font cards Default/Georgia/Literata/Helvetica/Open Sans, Font Size, Brightness, Line Spacing, Margins, Theme color dots, and Dark Mode Auto/Light/Dark segmented buttons.

##### Native bridge control ledger

- [ ] iOS native footer: UIKit tab items `list.bullet`, `bubble.left.and.bubble.right`, `gearshape`; light haptic on selection; native active-tab sync.
- [ ] iOS native color picker: Yellow/Red/Blue/Green/Violet buttons, selected ring/checkmark, optional Delete button, outside-tap/pan/scroll/iframe-touch dismiss, and 3.5s auto-dismiss.
- [ ] iOS native chat composer: multiline text view, placeholder, Plus button placeholder, Mic/focus button, waveform empty button, Arrow Up send button, Stop running button, keyboardLayoutGuide positioning, disabled limit state, and footer hiding while composer is visible.
- [ ] iOS native edit menu: Highlight, Add Note, Search in Book, Wikipedia, plus OS-provided Copy/Translate/Share/Look Up/Speak/Writing Tools where available.
- [ ] Android native selection menu: Highlight, Add Note, Search in Book, Wikipedia; callbacks preserve selected range and reject unknown actions.
- [ ] Desktop Tauri native selection/context menu: Highlight submenu with color/style choices, Add Note, Search in Book, and Wikipedia; current desktop native menu does not expose Remove Highlight.

#### 0. Reader platform lanes

Record one result per platform because the same reader action can be exposed by different controls.

```txt
Reader platform lanes
├─ Web desktop
│  ├─ web-chromium
│  ├─ web-webkit
│  └─ web-edge-windows
├─ Mobile web
│  ├─ mobile-web-ios
│  └─ mobile-web-android
├─ Desktop native
│  ├─ tauri-macos
│  └─ tauri-windows
└─ Mobile native
   ├─ native-ios
   └─ native-android
```

##### `web-chromium`

- Runtime surface: desktop browser.
- Primary reader UI surface: web header/footer/sidebar/notebook.
- Notes: first automation baseline.

##### `web-webkit`

- Runtime surface: desktop Safari/WebKit.
- Primary reader UI surface: web header/footer/sidebar/notebook.
- Notes: Safari/WebKit event and selection parity.

##### `web-edge-windows`

- Runtime surface: Edge on Windows.
- Primary reader UI surface: web header/footer/sidebar/notebook.
- Notes: Windows browser keyboard/context-menu parity.

##### `mobile-web-ios`

- Runtime surface: iOS Safari/WebKit viewport.
- Primary reader UI surface: web mobile footer/sheets, not native UIKit.
- Notes: no iOS Tauri native footer.

##### `mobile-web-android`

- Runtime surface: Android Chrome viewport.
- Primary reader UI surface: web mobile footer/sheets, not native Android bridge.
- Notes: no native back/volume bridge unless Tauri Android.

##### `tauri-macos`

- Runtime surface: macOS Tauri app.
- Primary reader UI surface: web reader plus macOS traffic lights/native context menu.
- Notes: native traffic lights replace HTML window buttons.

##### `tauri-windows`

- Runtime surface: Windows Tauri app.
- Primary reader UI surface: web reader plus Windows window buttons/native context menu.
- Notes: HTML window controls are expected.

##### `native-ios`

- Runtime surface: iOS Tauri app / WKWebView.
- Primary reader UI surface: web reader plus UIKit footer/color picker/native edit menu/native chat composer.
- Notes: highest platform divergence.

##### `native-android`

- Runtime surface: Android Tauri app / WebView.
- Primary reader UI surface: web mobile reader plus Android back/volume/native selection behavior.
- Notes: native footer is not implemented like iOS.

#### 1. Reader route and deep-link matrix

##### URL forms

- [ ] `/reader?ids=<bookHash>` opens one book on Tauri/PWA/web fallback routes.
- [ ] `/reader/<bookHash>` opens one book on non-PWA web routes.
- [ ] `/reader/<bookHash>?<queryParams>` preserves optional query params on web non-PWA.
- [ ] `/reader?ids=<bookA>%2B<bookB>` opens multi-book reader from query params; raw `+` in query strings is a known ambiguity because it can decode as a space.
- [ ] `/reader/<bookA>+<bookB>` opens multi-book reader from path params.
- [ ] `/reader?ids=<bookA>%2B<bookA>` opens duplicate instances as separate reader cells without corrupting primary-book state.
- [ ] `/reader` with no `ids` currently risks rendering no recoverable reader UI; keep this as a known gap until a Library fallback or empty-state recovery is implemented.
- [ ] Invalid, deleted, unavailable, or not-downloaded `ids` show an error toast and safe return path to Library.
- [ ] URL-encoded IDs and the `+`/`%2B` separator are parsed consistently across browser address bar, internal links, copied links, PWA routing, and Tauri routing.
- [ ] Reader deep links preserve extra query params where expected and ignore unsupported params safely.
- [ ] Reloading every supported URL restores the same book(s), active shell, progress, and side panel state as designed.
- [ ] Auth redirects that originate in Reader preserve the full reader path and query string.
- [ ] `openread://activity-capture?route=/reader&screen=reader&state=reader-open&...` opens Reader through the ActivityCapture bridge when a local library book exists.
- [ ] `openread://activity-capture?...&onboarding=skip` marks onboarding complete before routing.
- [ ] Activity-capture reader targets fall back to `/library` when no eligible local library book exists.
- [ ] `openread://loc/<offset>` AI citation links navigate within the current reader by character offset and do not leave the app.
- [ ] File/content open-with inputs (`?file=`, CLI `file1`-`file4`, `file://`, `content://`) open through the library/import path and do not get mistaken for reader book IDs.
- [ ] Direct `openread://reader?ids=<bookHash>` behavior is documented as not implemented/currently unhandled unless a future bridge maps it explicitly.

##### Open and close entry points

- [ ] Open from Library book card.
- [ ] Open from Home/global search result.
- [ ] Open from Explore imported book / Read button.
- [ ] Open from Activity capture bridge target.
- [ ] Navigate within an already-open Reader from AI citation link (`openread://loc/<offset>`) inside an answer; this is not a standalone reader-open deep link.
- [ ] Open from Tauri `showReaderWindow` in a separate reader window.
- [ ] Open with external/local files on desktop app does not break last-open-books state.
- [ ] Open with mobile file/content intents does not misroute into `/reader?ids=`.
- [ ] Header Back to Library closes the current reader safely.
- [ ] Sidebar Go to Library closes and saves all open books.
- [ ] Closing one book in multi-book grid leaves remaining books readable and updates sidebar target.
- [ ] Closing the last book returns to Library on main window.
- [ ] Closing the last book closes the separate Tauri reader window when appropriate.
- [ ] Browser Back / Android Back / window close attempt to flush progress, notes, KOSync, TTS stop, and settings; beforeunload/window-close paths are best-effort and must be verified per platform.
- [ ] Reader close on primary book dispatches sync progress and flushes KOSync before clearing state.
- [ ] Closing a desktop primary reader clears Discord presence when enabled/currently active.

#### 2. Chrome visibility and input model

- [ ] Desktop hover top reveals Header Bar; leaving hides it unless a dropdown is open.
- [ ] Desktop hover bottom reveals Footer Bar; leaving hides it unless focus remains in footer controls.
- [ ] Desktop center click toggles chrome; side clicks paginate when click-to-paginate is enabled.
- [ ] Mobile single tap toggles reader chrome instead of turning pages.
- [ ] Mobile swipe turns fixed-layout pages where supported.
- [ ] Scrolled mode wheel/touch scroll does not accidentally show/hide chrome.
- [ ] Header/footer do not intercept links or pointer cursors inside book content.
- [ ] Search, sidebar, notebook, TTS panel, RSVP overlay, settings dialog, and annotation popup each dismiss chrome predictably.
- [ ] Escape closes active menu/dialog/search/popup before leaving reader.
- [ ] Android Back closes footer/header, sidebar, or notebook before closing reader.
- [ ] Native iOS system UI visibility follows reader chrome visibility and safe-area insets.

#### 3. Desktop reader header controls

Applies to `web-chromium`, `web-webkit`, `web-edge-windows`, `tauri-macos`, and `tauri-windows` unless noted.

- [ ] Toggle Sidebar opens and closes sidebar.
- [ ] Add Bookmark creates a bookmark at the current location.
- [ ] Remove Bookmark removes the current-location bookmark.
- [ ] Translation toggle is visible when translation is available.
- [ ] Translation toggle clearly shows gated tier state when user is not allowed.
- [ ] Translation toggle enables/disables translated content and persists after reload.
- [ ] Quick Action button appears when `Enable Quick Actions` is enabled.
- [ ] Quick Action button tooltip/label reads `Enable Quick Action on Selection` before an action is active and `Disable Quick Action` while an action is active.
- [ ] Quick Action menu exposes Instant Highlight, Instant Search, Instant Dictionary, Instant Wikipedia, Instant Translate, and Instant Speak.
- [ ] Quick Action menu selecting the already-selected action disables it and shows the `Instant {{action}} Disabled` toast.
- [ ] Quick Action Highlight uses current global highlight style/color.
- [ ] Font & Layout opens Settings Dialog for the correct active book.
- [ ] Notebook button opens/closes Notebook and preserves the active tab.
- [ ] View Options opens menu and keeps header pinned while open.
- [ ] Window Close closes the active book; in multi-book mode it does not close all books unless it is the last book.
- [ ] Windows/Linux Tauri HTML minimize/maximize/close buttons work when native traffic lights are absent.
- [ ] macOS Tauri native traffic lights remain visible/clickable and do not overlap Sidebar toggle.

#### 4. Mobile reader header controls

##### Shared mobile header

- [ ] Back to Library closes the book and returns safely to Library.
- [ ] Book title truncates without overlapping controls.
- [ ] Bookmark toggle works and reflects state.
- [ ] More Options opens View Menu and stays reachable with safe-area/status-bar insets.

##### iOS native header additions

- [ ] Search button opens sidebar search with focused input and hides native footer.
- [ ] Reading Progress button opens the iOS progress overlay below the header.
- [ ] Progress overlay auto-hides after timeout and resets timer on interaction.
- [ ] Progress overlay supports previous/next page, previous/next section, back, forward, and slider jump.

##### Non-iOS mobile header additions

- [ ] AI Chat button toggles notebook AI tab.
- [ ] AI Chat active state is visible while notebook AI tab is open.
- [ ] Header AI Chat and inline question bar create/route to the same conversation context.

#### 5. View Options menu inventory

- [ ] Fixed-layout/PDF Zoom Out button works and disables at minimum zoom.
- [ ] Fixed-layout/PDF Reset Zoom returns to 100%.
- [ ] Fixed-layout/PDF Zoom In works and disables at maximum zoom.
- [ ] Single Page toggles spread mode to none.
- [ ] Auto Spread toggles spread mode to auto.
- [ ] Fit Page toggles zoom mode to fit-page.
- [ ] Fit Width toggles zoom mode to fit-width.
- [ ] Separate Cover Page toggles and is disabled when Single Page is active.
- [ ] Font & Layout appears on non-mobile only and opens Settings Dialog.
- [ ] Scrolled Mode toggles paginated/scrolled rendering and is disabled for fixed layout.
- [ ] Paragraph Mode toggles paragraph overlay and is disabled for fixed layout.
- [ ] Speed Reading Mode opens RSVP start dialog and is disabled/unavailable for unsupported formats.
- [ ] iOS Read Aloud toggles TTS for current reader position.
- [ ] iOS Translation toggles translated content and persists; verify gating/availability messaging separately because this menu path does not use the same disabled-button gate as the desktop header Translation toggle.
- [ ] iOS AI Chat toggles notebook AI tab.
- [ ] iOS Book Info opens and closes book detail modal; current event payload wiring needs validation because the menu dispatches `bookKey` while the modal expects a `Book`.
- [ ] Sign in to Sync redirects to auth with reader return path.
- [ ] Signed-in Sync dispatches progress sync and updates the label from `Never synced` to `Synced at {{time}}` when sync state is saved.
- [ ] Fullscreen appears only where `hasWindow` is true and toggles native fullscreen.
- [ ] Theme mode cycles Auto → Light → Dark → Auto and updates reader immediately.
- [ ] Invert Image in Dark Mode is disabled in light mode and toggles only in dark mode.

#### 6. Desktop footer and navigation controls

- [ ] Previous Section navigates to previous section.
- [ ] Previous Page navigates previous page or scroll segment.
- [ ] Go Back is disabled without history and enabled after navigation.
- [ ] Go Forward is disabled without forward history and enabled after Go Back.
- [ ] Reading progress text uses selected progress style: percentage or fraction.
- [ ] Jump to Location slider seeks and updates progress without losing book state.
- [ ] Speak starts TTS from current/saved TTS location.
- [ ] Speak toggles to stop/pause state through TTS panel/bar as designed.
- [ ] Next Page navigates next page or scroll segment.
- [ ] Next Section navigates next section.
- [ ] RTL books swap previous/next labels/actions correctly.
- [ ] Vertical writing books place progress/header/footer controls without overlap.
- [ ] Fixed-layout zoomed books support panning before page-turn fallback.
- [ ] ProgressInfo margin text displays time left, pages left, current/total page or percentage according to Header & Footer settings.
- [ ] Tapping ProgressInfo cycles visible info modes only when Tap to Toggle Footer is enabled.
- [ ] ProgressInfo remains readable in vertical writing, scrolled mode, E-Ink mode, safe-area layouts, and mobile viewports.

#### 7. Non-iOS mobile footer controls

Applies to mobile web and Android app unless platform-specific behavior says otherwise.

- [ ] Table of Contents button opens sidebar TOC and hides reader chrome.
- [ ] Color button opens color panel.
- [ ] Color panel screen brightness slider appears only when device brightness is supported.
- [ ] Color panel theme color buttons apply immediately.
- [ ] Color panel Auto/Light/Dark cycle works and persists.
- [ ] Reading Progress button opens progress panel.
- [ ] Progress panel slider seeks and updates progress.
- [ ] Progress panel previous/next page, previous/next section, back, and forward work.
- [ ] Font & Layout button opens mobile font/layout panel.
- [ ] Mobile font/layout font size slider applies and shows Small/Large ends.
- [ ] Mobile font/layout page margin slider applies margin/gap and shows Small/Large ends.
- [ ] Mobile font/layout line spacing slider applies and shows Small/Large ends.
- [ ] Speak button starts/stops TTS and handles unsupported PDF with friendly warning.
- [ ] Footer panel can be closed by tapping active tab again or tapping reader content.
- [ ] Android volume-key page flip works only when setting is enabled.
- [ ] Android hardware Back hides footer/sidebar/notebook before closing reader.

#### 8. iOS native footer and half-sheet controls

Applies to `native-ios` only.

- [ ] Native UITabBar appears only when reader chrome is visible.
- [ ] Native footer tabs are TOC (`list.bullet`), Chat (`bubble.left.and.bubble.right`), and Settings (`gearshape`).
- [ ] Tapping any native tab fires light haptic feedback.
- [ ] Tapping active native footer tab deselects it and closes its sheet.
- [ ] Switching TOC → Chat → Settings changes sheet content without flicker/remount.
- [ ] Native footer active tab highlight follows web sheet state.
- [ ] HalfSheet overlay tap closes sheet.
- [ ] HalfSheet drag handle can dismiss downward, snap back, or expand upward to full height.
- [ ] Expanded HalfSheet back button closes sheet and respects top safe-area inset.
- [ ] TOC sheet tabs: Chapters, Highlights, Bookmarks.
- [ ] TOC sheet Chapters navigates to selected chapter and closes/updates sheet as designed.
- [ ] TOC sheet Highlights shows `No highlights yet` empty state or annotations and supports navigation.
- [ ] TOC sheet Bookmarks shows `No bookmarks yet` empty state or bookmarks and supports navigation.
- [ ] TOC sheet no-content states include `No content available` and `No chapters found`.
- [ ] Chat sheet lists Recents, New Chat, conversation rows, multi-book badges, More options/Delete, and selecting a conversation closes the sheet and opens notebook/chat.
- [ ] Settings sheet exposes font family cards: Default, Georgia, Literata, Helvetica, Open Sans.
- [ ] Settings sheet Font Size slider applies.
- [ ] Settings sheet Brightness slider appears only when supported and applies via native bridge.
- [ ] Settings sheet Line Spacing slider applies.
- [ ] Settings sheet Margins slider applies.
- [ ] Settings sheet theme color buttons apply and show selected checkmark/initial.
- [ ] Settings sheet Dark Mode segmented control applies Auto, Light, Dark; tapping the active segment cycles to the next mode when coded.
- [ ] Native footer and inline question bar do not overlap at bottom safe area.
- [ ] Native chat composer appears/hides only for AI chat and respects keyboard layout.
- [ ] Native chat composer plus and mic buttons respond with haptics/focus behavior even though plus is a placeholder for future attachments.

#### 9. Sidebar, book menu, and search

##### Sidebar shell

- [ ] Sidebar opens from header, mobile TOC footer button, selection search, and search shortcut.
- [ ] Sidebar overlay click closes unpinned sidebar.
- [ ] Mobile sidebar drag handle dismisses or snaps back with haptic feedback where supported.
- [ ] Desktop sidebar resize handle works by pointer and keyboard.
- [ ] Pin Sidebar keeps sidebar docked; Unpin restores overlay behavior.
- [ ] Close button closes mobile sidebar.
- [ ] Go to Library closes reader and returns safely.
- [ ] Book card More Info opens Book Details modal.
- [ ] Book Details modal Close works from Reader.
- [ ] Book Details view controls are validated when handlers are provided: Edit Metadata, Download from Cloud, Upload to Cloud, Export Book.
- [ ] Edit Metadata controls, source selector, save/cancel/reset/lock flows are covered in metadata baseline, but Reader must verify opening/closing does not corrupt reader state.

##### Book Menu

- [ ] Parallel Read submenu lists up to 20 downloaded, non-fixed-layout library books with cover thumbnails and title labels.
- [ ] Selecting a book from Parallel Read opens it in multi-book reader.
- [ ] Top-level Parallel Read can show Enable/Disable tooltip and checkmark when multiple books/parallel views are active.
- [ ] Enter Parallel Read appears with multiple open books and enables parallel mode.
- [ ] Exit Parallel Read appears/enables when parallel mode is active.
- [ ] Top-level Parallel Read item does not confuse submenu open with toggle behavior.
- [ ] Export Annotations opens export dialog or friendly empty-state toast.
- [ ] Sort TOC by Page toggles checkmark and changes TOC order.
- [ ] Reload Page reloads reader and restores current book state.
- [ ] Disabled/commented menu items — KOReader Sync, Push Progress, Pull Progress, Show on Discord, Proofread, Download Openread, About Openread — are not visible unless intentionally re-enabled.

##### KOReader sync surfaces

- [ ] KOReader Sync Settings dialog is mounted but the Book Menu entry is currently disabled/commented; verify it is not user-visible unless intentionally re-enabled.
- [ ] If invoked through future wiring/custom event, connection controls include Server URL, Username, Password, Connect, and connection error text.
- [ ] Connected controls include Sync Server Connected toggle/disconnect, Sync Strategy, Checksum Method, and Device Name.
- [ ] Sync Strategy options include Ask on conflict, Always use latest, Send changes only, Receive changes only.
- [ ] Checksum Method options include File Content (recommended) and disabled File Name.
- [ ] Sync Conflict resolver can appear automatically during reader sync and exposes close, Local Progress, Remote Progress, remote device name, and progress preview text.

##### Search

- [ ] Search toggle shows input and focuses it.
- [ ] Mobile search mode replaces sidebar header with Back/Close search button.
- [ ] Search input minimum length behavior works for CJK and non-CJK text.
- [ ] Search options menu exposes Book, Chapter, Match Case, Match Whole Words, Match Diacritics.
- [ ] Changing each search option reruns or resets search as expected.
- [ ] Clear search button clears input, highlights, and results and refocuses the input.
- [ ] Search history chips appear after successful searches.
- [ ] Search history chip reruns prior search.
- [ ] Clear search history removes chips and cache.
- [ ] Search progress indicator appears for long-running search and shows percent on mobile.
- [ ] Search result click/Enter/Space navigates to matching CFI.
- [ ] Mobile search result click hides search/sidebar where intended and clears highlights.
- [ ] Search result nav bar exposes Show Search Results, Previous Result, Next Result, and Close Search.
- [ ] Search nav previous/next result respects disabled boundaries.
- [ ] Escape blurs focused search input first, then closes search on a second press.

##### Sidebar tabs

- [ ] TOC tab lists chapters and nested TOC expand/collapse controls.
- [ ] TOC item navigates on click/Enter and updates active item.
- [ ] Annotate tab lists highlights/notes grouped by chapter.
- [ ] Bookmark tab lists bookmarks grouped by chapter.
- [ ] Annotation/bookmark row hover/focus reveals Edit/Delete where applicable.
- [ ] Bookmark Edit opens inline text editor with Cancel and Save.
- [ ] Annotation Edit opens Notebook note editor; Delete marks note deleted and updates rendered annotation.
- [ ] Chat tab appears only when AI history is enabled.
- [ ] Chat tab Recents supports New Chat, conversation select, multi-book hover badge, More options, Delete.
- [ ] Mobile tapping the active tab closes sidebar and restores reader chrome.
- [ ] Booknotes nav bar supports show results, previous, next, and close.

#### 10. Notebook and AI reader surfaces

- [ ] Notebook opens from desktop header Notebook button.
- [ ] Notebook opens from selected-text Annotate action.
- [ ] Notebook opens from inline question bar submission.
- [ ] Notebook opens from mobile/non-iOS AI Chat button.
- [ ] Notebook opens from iOS More Options AI Chat.
- [ ] Notebook opens from iOS native footer Chat tab/history selection.
- [ ] Desktop Notebook pin/unpin works.
- [ ] Desktop Notebook resize handle works by pointer drag and keyboard arrow step.
- [ ] Mobile Notebook close button returns to reader and preserves safe-area padding.
- [ ] Desktop unpinned Notebook overlay click dismisses notebook and clears pending annotation editor state.
- [ ] Notebook search toggles only on Notes tab and clears results/term when hidden.
- [ ] Notebook search input filters notes and excerpts with one-character minimum.
- [ ] Notebook no-match state appears only when there are notes/excerpts but search has no matches.
- [ ] Notebook Notes/AI tab navigation works and persists active tab.
- [ ] Mobile AI tab hides bottom Notebook tab navigation because header/native composer owns the flow.
- [ ] New Chat button appears on AI tab and creates a new chat for the primary book plus parallel hashes.
- [ ] Chat history Recents list loads existing conversations for the primary book.
- [ ] Chat history New Chat creates a conversation and opens Notebook AI.
- [ ] Chat history selecting a conversation opens Notebook AI and restores parallel-book context when owned books are available.
- [ ] Chat history multi-book badge shows count and hover card with covers/titles.
- [ ] Chat history More options opens Delete and delete confirmation before removing a conversation.
- [ ] Inline question bar Ask creates conversation for primary book and includes parallel book hashes when in parallel mode.
- [ ] Inline question bar Dismiss hides the bar for the current reader session.
- [ ] Inline question bar hides when AI notebook is visible or mobile sheet/footer is active.
- [ ] AI empty state shows Ask about this book, composer, quota counter when applicable, and limit card when quota is exhausted.
- [ ] AI desktop header New Chat works independently from NotebookHeader New Chat.
- [ ] BYOK Select Model button appears only when a BYOK provider and selector are available.
- [ ] Model picker fetches/caches models, supports search, selected checkmark, fallback models on fetch error, outside-click close, and optional Manage providers.
- [ ] Composer Send message is visible only with text and not running; Cancel response replaces send while running.
- [ ] iOS native composer sends via `__openreadNativeChatSend`, cancels via `__openreadNativeChatCancel`, disables while quota-limited, and hides the native footer while visible.
- [ ] Scroll to bottom button appears when the thread is not at bottom and hides when at bottom.
- [ ] User message actions expose Edit and Copy; edit composer exposes Cancel and Update.
- [ ] Assistant message actions expose branch previous/next picker when branches exist, Regenerate/Reload, and Copy.
- [ ] LimitReachedCard exposes Upgrade, Dismiss, Use boost/Add boost when handlers are wired, reset countdown, and boost balance copy.
- [ ] AI answer navigation to offsets (`navigate-to-offset`) moves reader to referenced passage.
- [ ] Citation links with invalid/non-numeric offsets do not navigate.
- [ ] AI disabled setting hides inline question bar and sidebar Chat history; mobile/iOS AI entry points may still open the AI surface, which should show the `Enable AI in Settings` disabled state rather than starting chat.

#### 11. Selection, annotations, and context menus

##### Web/desktop selection popup

- [ ] Selecting EPUB text opens selection popup.
- [ ] Popup buttons expose Copy, Highlight, Annotate, Search, Dictionary, Wikipedia, Translate, Speak, Proofread.
- [ ] Copy writes selected text to clipboard.
- [ ] Copy to Notebook setting creates an excerpt and opens Notebook on desktop.
- [ ] Highlight creates highlight using current style/color.
- [ ] Existing highlighted text opens edit/delete state; Delete Highlight removes it.
- [ ] Highlight color choices include yellow, red, green, blue, violet, and configured custom colors where applicable.
- [ ] Highlight style choices include highlight, underline, squiggly.
- [ ] Highlight options update global highlight style/color and immediately update selected highlight when editing.
- [ ] Annotate creates highlight + note editor.
- [ ] Note editor shows selected text, Add your notes placeholder, Cancel, Save, Ctrl+Enter save, and Escape cancel.
- [ ] Existing annotation note cards open the Annotation sidebar when clicked.
- [ ] Search sends selected text to sidebar search and navigates results.
- [ ] Dictionary opens Wiktionary popup and in-definition links can trigger another lookup.
- [ ] Wikipedia opens Wikipedia popup with summary content/source footer or error fallback.
- [ ] Translate opens translator popup and respects translation availability/gating.
- [ ] Translator popup exposes Original Text source language selector, Translated Text target selector, provider selector, loading state, and login/quota errors.
- [ ] Speak starts one-time TTS for selection and does not overwrite ongoing TTS unexpectedly.
- [ ] Proofread opens popup for short selections and shows 30-word warning for long selections.
- [ ] Proofread popup Apply is disabled without replacement text, Enter applies when replacement exists, and whole-word validation blocks invalid partial selections.
- [ ] PDF selected text disables Highlight, Annotate, Search, Speak, Proofread as coded and still allows Copy/Dictionary/Wikipedia/Translate where supported.
- [ ] Escape/outside click dismisses popup and clears selection without breaking pagination.

##### Quick actions

- [ ] Instant Highlight applies without popup on desktop when enabled.
- [ ] Instant Search opens sidebar search.
- [ ] Instant Dictionary opens dictionary popup.
- [ ] Instant Wikipedia opens Wikipedia popup.
- [ ] Instant Translate opens translator popup.
- [ ] Instant Speak starts one-time selection TTS.
- [ ] Mobile quick action still shows choice popup/native menu instead of silently applying an action.

##### Native/context menus

- [ ] Web Chromium right-click on selected text does not suppress browser context menu in a way that breaks selection popup.
- [ ] Desktop Tauri right-click opens native menu with Highlight submenu, Add Note, Search in Book, and Wikipedia; current desktop native menu does not expose Remove Highlight.
- [ ] Desktop Tauri Highlight submenu includes colors Yellow/Red/Green/Blue/Violet and styles Highlight/Underline/Squiggly.
- [ ] iOS native edit menu includes Highlight, Add Note, Search in Book, Wikipedia plus OS Copy/Translate/Share/Look Up/Speak/Writing Tools where supported.
- [ ] iOS native color picker appears after highlight and on tapping existing highlight.
- [ ] iOS native color picker color order is Yellow, Red, Blue, Green, Violet; web popup/default highlight editor order differs and should not be treated as the same visual order.
- [ ] iOS native color picker can change color and remove highlight when Delete is shown.
- [ ] iOS native color picker shows selected ring/checkmark and optional red trash button.
- [ ] iOS native color picker dismisses on outside tap, pan, scroll, iframe touchmove, explicit hide message, or 3.5s auto-dismiss.
- [ ] Android native selection menu includes Highlight, Add Note, Search in Book, Wikipedia.
- [ ] Android native selection preserves selected range while native menu actions execute.
- [ ] Android selection does not auto-scroll paginated content away from the selection.
- [ ] Native menu callbacks reject unknown action/color/style values safely.

##### Proofread replacement rules manager

- [ ] Proofread Replacement Rules dialog is mounted in Reader but its Book Menu entry is currently disabled/commented; verify it is not user-visible unless intentionally re-enabled.
- [ ] If invoked through future wiring/custom event, sections include Selected Text Rules and Book Specific Rules with empty states.
- [ ] Rule rows display selected text, replacement, Scope, Case sensitive, Only for TTS, and Yes/No values.
- [ ] Selection-scoped rule Scope link navigates the reader back to the saved selection CFI.
- [ ] Edit opens Selected text and Replace with fields plus Save and Cancel.
- [ ] Delete removes the rule; non-TTS-only deletes recreate the viewer.

##### Export annotations dialog

- [ ] Export Annotations from Book Menu opens dialog when annotations/bookmarks exist.
- [ ] Empty export state shows `No annotations to export` toast and does not open the dialog.
- [ ] Format Options checkboxes toggle Title, Author, Export Date, Chapter Titles, Chapter Separator, Highlights, Notes, and Note Date.
- [ ] Advanced Show/Hide toggles advanced section.
- [ ] Use Custom Template disables standard format options while enabled.
- [ ] Export Template textarea edits template and Reset Template restores default template.
- [ ] Template Syntax help lists Insert value, date format, conditional, and loop examples.
- [ ] Available Variables lists title, author, exportDate, chapters, chapter title, annotations, annotation text/note/style/color/timestamp.
- [ ] Date Format Tokens list `%Y`, `%m`, `%d`, `%H`, `%M`, `%S`.
- [ ] Preview switches between rendered preview and Show Source markdown.
- [ ] Export writes/saves markdown or copies to clipboard and shows success toast.
- [ ] Cancel closes dialog without exporting.

#### 12. TTS, RSVP, paragraph mode, and auxiliary overlays

##### TTS

- [ ] TTS starts from footer Speak, mobile footer Speak, iOS Read Aloud, keyboard shortcut, selection Speak, and media-session play action.
- [ ] TTS stops from the same user entry points and reader close; media-session `stop` is currently wired to pause, so verify whether that is intentional or should become full stop.
- [ ] TTS unsupported PDF warning appears and subsequent supported-book TTS still works.
- [ ] TTS floating icon appears while speaking on desktop and opens/closes the TTS panel.
- [ ] TTS panel rate slider displays 0.0-3.0 with Slow, 1.0, 1.5, 2.0, Fast markers, while current handler clamps the effective minimum to 0.2.
- [ ] TTS panel exposes Previous Paragraph, Play/Pause, Next Paragraph.
- [ ] TTS panel Set Timeout dropdown options select and countdown display updates.
- [ ] TTS timeout options include No Timeout, 1, 3, 5, 10, 20, 30, 45 minutes, and 1, 2, 3, 4, 6, 8 hours.
- [ ] TTS panel voice dropdown groups voices by engine/language, shows counts, selected checkmark, disabled voice styling, and no-voices fallback.
- [ ] Advanced TTS gating shows `Please log in to use advanced TTS features` where required and does not hide basic stop/recovery controls.
- [ ] TTS panel Toggle Sticky Bottom TTS Bar works and hides panel when sticky bar is enabled.
- [ ] Sticky TTS bar exposes Previous Paragraph, Previous Sentence, Play/Pause, Next Sentence, Next Paragraph.
- [ ] TTS highlight follows spoken text and scrolls to keep current mark visible.
- [ ] TTS saves/resumes `ttsLocation` only when the saved CFI is still inside current location.
- [ ] TTS with proofread `onlyForTTS` rules applies transformed SSML without mutating visible text.
- [ ] iOS background audio bridge enables while speaking and disables on stop.
- [ ] Mobile audio unblock/release runs without requiring extra tap after first start.
- [ ] TTS with translation enabled respects TTS Text source/translated mode.
- [ ] Media-session handlers support play, pause, seekforward, seekbackward, nexttrack, and previoustrack; current `stop` handler pauses rather than fully stopping/shutting down TTS.

##### RSVP / speed reading

- [ ] Speed Reading Mode opens start dialog.
- [ ] Start dialog shows title `Start RSVP Reading` and subtitle `Choose where to start reading`.
- [ ] From Chapter Start works.
- [ ] Resume saved position option appears and works when saved position exists.
- [ ] From Current Page works.
- [ ] From Selection appears when selection exists and works with truncated preview text.
- [ ] Cancel closes start dialog; backdrop click/Escape also closes.
- [ ] RSVP overlay Close works.
- [ ] Chapter dropdown opens, nested chapters are indented, active chapter is highlighted, and selecting chapter pauses/seeks.
- [ ] Context panel appears while paused and shows surrounding words.
- [ ] Countdown display appears before/resuming playback when controller uses countdown.
- [ ] Chapter Progress displays current word count, total words, and time left.
- [ ] Progress seek bar click/keyboard seeks and resumes if it was playing.
- [ ] Skip back/forward 15 words work.
- [ ] Play/Pause works.
- [ ] Punctuation Pause selector changes pause duration in milliseconds.
- [ ] Decrease/Increase speed buttons update WPM display.
- [ ] Keyboard shortcuts Space, Escape, Left/Right, Up/Down, Shift+Left/Right work while overlay is active.
- [ ] Touch tap zones work: left quarter back 15 words, right quarter forward 15 words, center play/pause.
- [ ] Horizontal swipe changes speed; controls/header taps do not trigger tap-zone actions.
- [ ] PDF unsupported warning appears.

##### Paragraph mode and reader aids

- [ ] Paragraph Mode toggles paragraph overlay.
- [ ] Previous/Next Paragraph buttons work.
- [ ] Paragraph mode responds to keyboard arrows, wheel, touch, and click zones.
- [ ] Exit Paragraph Mode closes overlay and restores normal pagination.
- [ ] Reading Ruler appears only when enabled and follows cursor/touch/reading line as designed.
- [ ] Footnote popup opens from footnote/link and dismisses on resize/outside click.
- [ ] Hint messages appear for progress sync or other reader hints and do not overlap chrome.

#### 13. Settings dialog deep inventory

##### Settings shell

- [ ] Settings tabs: Font, Layout, Color, Behavior, Language, Custom.
- [ ] Last active settings panel persists and restores via `lastConfigPanel`.
- [ ] Mobile header back button closes settings; desktop Close button and Escape close without focus trap issues.
- [ ] Search Settings opens command palette, closes settings dialog, and can jump to a specific setting with temporary highlight.
- [ ] Settings Menu exposes Global Settings and Reset Current Panel with active-panel label.
- [ ] Global Settings toggles between Apply to All Books and Apply to This Book and shows checkmark when global.
- [ ] Settings Menu on Font also exposes Clear Custom Fonts and Manage Custom Fonts.
- [ ] Reset Current Panel only affects the active panel and updates rendered reader state where applicable.
- [ ] Number inputs expose keyboard entry plus Increase/Decrease behavior and enforce min/max/step.

##### Font panel

- [ ] Override Book Font toggle.
- [ ] Default Font Size input.
- [ ] Minimum Font Size input.
- [ ] Font Weight input.
- [ ] Default Font selector supports Serif Font and Sans-Serif Font family choices.
- [ ] CJK Font selector appears when CJK environment/book applies.
- [ ] Font dropdown exposes configured options plus System Fonts where available.
- [ ] Manage Custom Fonts opens custom font manager.
- [ ] Custom Fonts breadcrumb Font returns to main font panel.
- [ ] Import Font accepts `.ttf`, `.otf`, `.woff`, `.woff2` and supports multi-file import.
- [ ] Delete Font toggles delete mode; Cancel exits delete mode; family delete removes all fonts in that family.
- [ ] Selecting a custom font family updates current Serif/Sans-Serif face based on Default Font family.
- [ ] Serif Font selector.
- [ ] Sans-Serif Font selector.
- [ ] Monospace Font selector.
- [ ] Clear Custom Fonts removes all custom fonts and updates available font lists.

##### Layout panel

- [ ] Override Book Layout toggle.
- [ ] Writing modes appear for likely RTL/CJK books and include Default, Horizontal Direction, Vertical Direction, RTL Direction.
- [ ] Vertical border frame appears in vertical layout and includes Double Border toggle plus red/black Border Color buttons.
- [ ] Paragraph controls include Paragraph Margin, Line Spacing, Word Spacing when language is not Chinese, Letter Spacing, Text Indent.
- [ ] Full Justification and Hyphenation toggles.
- [ ] Page controls include Top Margin (px), Bottom Margin (px), Left Margin (px), Right Margin (px), Column Gap (%), Maximum Number of Columns, Maximum Column Width/Height.
- [ ] Margin min values adjust when Show Header/Footer are enabled and safe-area/grid insets require larger margins.
- [ ] Apply also in Scrolled Mode for page settings.
- [ ] Header & Footer controls include Show Header, Show Footer, Show Remaining Time, Show Remaining Pages, Show Reading Progress.
- [ ] Show Remaining Time and Show Remaining Pages are mutually exclusive and disabled when Show Footer is off.
- [ ] Reading Progress Style selector includes Page Number and Percentage and disables when Show Reading Progress is off.
- [ ] Tap to Toggle Footer disables when Show Footer is off.
- [ ] Apply also in Scrolled Mode for header/footer settings.
- [ ] Mobile/native Screen Orientation appears only where orientation lock is available and includes Auto, Portrait, Landscape.

##### Color panel

- [ ] Theme Mode selector: Auto Mode, Light Mode, Dark Mode.
- [ ] Invert Image in Dark Mode toggle is disabled when not in dark mode.
- [ ] Override Book Color toggle.
- [ ] Theme Color selector applies built-in themes and shows selected radio/check state.
- [ ] Custom theme create/edit flow opens Custom Theme editor.
- [ ] Custom Theme editor includes Save, Delete when editing existing theme, Cancel, Theme Name, Light Mode Text/Background/Link Color, Dark Mode Text/Background/Link Color, and Preview.
- [ ] Background Image selector includes predefined textures, custom textures, Import Image, per-texture Delete, selected check state, Opacity slider, and Size selector Auto/Cover/Contain.
- [ ] Highlight Colors editor includes default Red/Violet/Blue/Green/Yellow color inputs, Custom Colors count, custom color picker, Add, edit, and Delete.
- [ ] TTS Highlighting style selector includes Highlighter, Underline, Strikethrough, Squiggly, Outline.
- [ ] TTS Highlighting color controls include color input, Save Current Color, Quick Colors Gold/Cyan/Pink/Green/Orange, custom color select, and Delete.
- [ ] Reading Ruler settings include Enable Reading Ruler, Lines to Highlight, Ruler Color Transparent/Yellow/Green/Blue/Rose, and Opacity.
- [ ] Code Highlighting settings include Enable Highlighting and Code Language with Auto plus available language list.

##### Behavior panel

- [ ] Scrolled Mode toggle.
- [ ] Continuous Scroll toggle.
- [ ] Overlap Pixels input is disabled unless scrolled mode is active.
- [ ] Click/Tap to Paginate toggle.
- [ ] Click/Tap Both Sides to Flip toggle disables when click/tap pagination is disabled.
- [ ] Swap Click/Tap Sides toggle disables when click/tap pagination is disabled or both-sides mode is enabled.
- [ ] Disable Double Click/Tap toggle.
- [ ] Volume Keys for Page Flip appears on mobile/native and acquires/releases native volume interception.
- [ ] Enable Quick Actions toggle.
- [ ] Quick Action selector includes None plus Instant Highlight/Search/Dictionary/Wikipedia/Translate/Speak and disables when quick actions are off.
- [ ] Copy to Notebook toggle.
- [ ] Paging Animation toggle.
- [ ] E-Ink Mode and Color E-Ink Mode platform visibility; Color E-Ink disables unless E-Ink is enabled.
- [ ] Auto Screen Brightness visibility on supported mobile devices.
- [ ] Allow JavaScript warning and toggle; disabled for non-EPUB formats and recreates viewer when changed.

##### Language panel

- [ ] Interface Language selector includes System Language plus translated locale list and applies UI language.
- [ ] Enable Translation toggle is disabled when no book key is available and recreates viewer when needed.
- [ ] Show Source Text toggle recreates viewer and updates translated/source layout.
- [ ] TTS Text selector includes Source and Translated, Translated Only, Source Only.
- [ ] Translation Service selector includes all translators and labels Login Required / Quota Exceeded states.
- [ ] Translate To target language selector includes System Language plus supported translator languages.
- [ ] Replace Quotation Marks appears where CJK applies, notes that it is enabled only in vertical layout, and recreates viewer.
- [ ] Convert Simplified and Traditional Chinese appears where CJK applies.
- [ ] Convert Mode options: No Conversion, Simplified to Traditional, Traditional to Simplified, Simplified to Traditional (Taiwan), Simplified to Traditional (Hong Kong), Simplified to Traditional (Taiwan) with phrases, Traditional (Taiwan) to Simplified, Traditional (Hong Kong) to Simplified, Traditional (Taiwan) to Simplified with phrases.

##### Custom panel

- [ ] Custom Content CSS textarea validates CSS while typing and shows error state.
- [ ] Custom Content CSS Apply appears only when unsaved and is disabled for invalid CSS.
- [ ] Custom Reader UI CSS textarea validates CSS while typing and shows error state.
- [ ] Custom Reader UI CSS Apply appears only when unsaved and is disabled for invalid CSS.
- [ ] Apply formats CSS, saves it, updates book/global settings as selected, and re-applies reader styles.
- [ ] Reset Current Panel clears both content and UI CSS.
- [ ] Android input focus scrolls editor into view and avoids keyboard-covered controls.

#### 14. Shortcuts, device buttons, and gestures

- [ ] Sidebar switch: Ctrl+Tab, Option+Tab, Alt+Tab.
- [ ] Toggle Sidebar: `s`.
- [ ] Toggle Notebook: `n`.
- [ ] Reader search: Ctrl/Cmd+F.
- [ ] Toggle Scrolled Mode: Shift+J.
- [ ] Toggle Bookmark: Ctrl/Cmd+D.
- [ ] Toggle TTS: `t`.
- [ ] Toggle Paragraph Mode: Shift+P.
- [ ] Selection Highlight: Ctrl/Cmd+H.
- [ ] Selection Underline: Ctrl/Cmd+U.
- [ ] Selection Annotate: Ctrl/Cmd+N.
- [ ] Selection Search: Ctrl/Cmd+F.
- [ ] Selection Copy: Ctrl/Cmd+C.
- [ ] Selection Translate: Ctrl/Cmd+T.
- [ ] Selection Dictionary: Ctrl/Cmd+D.
- [ ] Selection Wikipedia: Ctrl/Cmd+W.
- [ ] Selection Read Aloud: Ctrl/Cmd+R.
- [ ] Selection Proofread: Ctrl/Cmd+P.
- [ ] Open Font & Layout: Shift+F / Ctrl+, / Cmd+,.
- [ ] Command Palette: Ctrl/Cmd+Shift+P.
- [ ] Reload Page: Shift+R.
- [ ] Fullscreen: F11 where supported.
- [ ] Close Window: Ctrl/Cmd+W where Tauri/app supports.
- [ ] Quit App: Ctrl/Cmd+Q where Tauri/app supports.
- [ ] Left navigation: ArrowLeft, `h`, Shift+Space.
- [ ] Right navigation: ArrowRight, `l`, Space.
- [ ] Up/down navigation: ArrowUp/`k`, ArrowDown/`j`.
- [ ] Next/previous page/viewport shortcuts: Shift+J, Shift+K, Shift+ArrowRight/Left, Shift+ArrowDown/Up, PageDown/PageUp.
- [ ] Section navigation shortcuts: Option/Alt+ArrowLeft/Right and Option/Alt+ArrowUp/Down.
- [ ] History navigation shortcuts: Shift+H, Shift+L, Shift+ArrowLeft/Right, Alt+ArrowLeft/Right.
- [ ] Half-page scrolled-mode shortcuts: `d` and `u` plus Shift+ArrowDown/Up.
- [ ] Zoom shortcuts Ctrl/Cmd/Shift +/- and Ctrl/Cmd+0 work on fixed-layout/PDF.
- [ ] Save Note: Ctrl+Enter in note editors.
- [ ] Escape closes active popup/menu/search/notebook/sidebar/settings/RSVP before leaving reader.
- [ ] Mouse back/forward buttons navigate reader history.
- [ ] Android hardware volume keys flip pages only when enabled.
- [ ] Android hardware Back follows close hierarchy.
- [ ] Default shortcut entries not currently wired by reader handlers, such as Shift+S Toggle Select Mode and Ctrl+O Open Books, are verified as hidden/no-op or documented before exposing.
- [ ] Shortcut collision watch: Shift+J is assigned to both Toggle Scrolled Mode and Go Next; additional duplicate default bindings include Ctrl/Cmd+F, Ctrl/Cmd+D, Ctrl/Cmd+W, Shift+ArrowLeft/Right, and Shift+ArrowUp/Down. Verify actual runtime behavior before documenting any duplicate binding as a safe user shortcut.

#### 15. Duplicate-label and different-functionality audit

For each item, record whether duplication is intentional, confusing, or broken per platform.

- [ ] `Font & Layout`: desktop header opens full Settings Dialog; desktop View Menu opens same dialog; non-iOS mobile footer opens compact panel; iOS Settings tab opens compact half-sheet.
- [ ] `Search`: iOS header opens sidebar search; sidebar header toggles sidebar search; selection Search searches selected text; Notebook search filters notes; global search opens reader.
- [ ] `AI Chat` / `Chat`: desktop Notebook button opens notebook; non-iOS mobile header opens AI; iOS View Menu opens AI; iOS native footer Chat opens history sheet; inline question bar creates a conversation.
- [ ] `Reading Progress`: desktop footer label/slider; non-iOS mobile progress panel; iOS header progress overlay; progress info overlay in reader margins.
- [ ] `Translation` / `Translate`: header/View Menu toggles full-book translation; selection Translate opens popup; Language panel configures provider/target/source text.
- [ ] `Speak` / `Read Aloud` / `TTS`: footer starts full-book TTS; iOS View Menu starts full-book TTS; selection Speak starts one-time selection TTS; TTS panel/bar controls playback.
- [ ] `Close` / `Back`: mobile header closes book; sidebar close closes sidebar; notebook close closes notebook; search close closes search; content nav close closes result navigation; window close may close book/window.
- [ ] `Bookmark`: header toggles current-location bookmark; sidebar/mobile TOC Bookmarks tab lists bookmarks.
- [ ] `Highlight`: selection popup creates/deletes highlight; quick action creates instant highlight; desktop native context submenu highlights with selected color/style; iOS color picker edits/deletes existing highlight.
- [ ] `Parallel Read`: top-level menu item can act as toggle when multiple books are open, while child items open another downloaded book.
- [ ] `Scrolled Mode`: View Menu toggle and Behavior panel toggle must stay in sync.
- [ ] `Theme`: View Menu cycles theme mode; Settings Color panel selects explicit mode/color; mobile panels expose smaller theme controls.
- [ ] `Previous/Next`: verify RTL swaps labels/actions consistently across desktop footer, mobile progress panel, iOS progress overlay, TTS bar, RSVP, search nav, and booknote nav.

#### 16. Code-audit watch items to validate manually

These are not declared product bugs yet; they are high-value QA probes found while inventorying reader code.

- [ ] Non-iOS mobile progress panel should respect RTL. Current `MobileFooterBar` does not pass `viewSettings` into `NavigationPanel`, so verify labels/actions on RTL books.
- [ ] `/reader` with no ids should show a recoverable state instead of a blank page.
- [ ] Query-style multi-book reader links should encode `BOOK_IDS_SEPARATOR` as `%2B`; raw `+` can decode as a space and break multi-book/duplicate-ID routes.
- [ ] Translation gated button is disabled when not allowed; verify users still see enough upgrade/gating guidance because disabled buttons do not fire toast handlers.
- [ ] Keyboard shortcut opening Settings should target the active book, not stale `settingsDialogBookKey`.
- [ ] TTS unsupported PDF path should not leave TTS internally locked for subsequent attempts.
- [ ] Media-session `stop` currently pauses TTS; decide whether product wording should call it pause or implementation should perform a full TTS shutdown.
- [ ] iOS View Menu Book Info should pass a `Book` object to Book Details; current dispatch path may pass only `bookKey`.
- [ ] Desktop Tauri native context menu does not expose Remove Highlight; either keep it documented as absent or add implementation before testing it as present.
- [ ] View Menu and Search Options callbacks include optional dropdown-closing hooks; verify menus actually close after actions on every platform.
- [ ] Quick Action checklist should not expect `Copy` in the Quick Action menu unless product intentionally adds it; code exposes Highlight/Search/Dictionary/Wikipedia/Translate/Speak.
- [ ] Search and annotation popups should not overlap native iOS footer, native color picker, or inline question bar.
- [ ] Multiple open instances of the same book should save progress/notes without duplicate-primary corruption.
- [ ] Native iOS footer visible/active-tab messages should not force footer visible when active tab changes during hide.
- [ ] Shortcut conflicts should not trigger multiple actions unexpectedly; current shortcut map includes duplicates for Shift+J, Ctrl/Cmd+F, Ctrl/Cmd+D, Ctrl/Cmd+W, Shift+ArrowLeft/Right, and Shift+ArrowUp/Down.
- [ ] Mounted-but-hidden dialogs (KOReader Sync Settings, Proofread Replacement Rules, About, Updater) should either remain intentionally unreachable or gain visible entry points with QA coverage.

#### 17. Evidence and signoff per platform

- [ ] Capture route URL, platform lane, book title/format, user tier, and account.
- [ ] Capture screenshot for every distinct reader surface: header, view menu, footer, sidebar, search, notebook, settings, selection popup, TTS, RSVP, mobile sheet/native footer.
- [ ] Capture video for failures, gestures, native footer, native edit menu, Android Back/volume, and iOS keyboard/native composer.
- [ ] Mark each scenario Pass / Fail / Partial / Not applicable.
- [ ] For duplicate-label audit items, record whether duplication is intentional, confusing, or broken.
- [ ] For failures, include platform, route URL, book format, exact control path, expected result, actual result, and recovery behavior.

<a id="43-catalog--explore"></a>

### 4.3 Catalog / Explore

Status: `Unknown / needs audit`

```txt
Catalog / Explore
├─ Current state
├─ User workflows
│  ├─ Browse/search catalog
│  ├─ View book details
│  ├─ Import/download/read
│  ├─ Source-specific behavior
│  └─ Error/rate-limit states
├─ Controls and entry points
├─ Platform behavior
├─ Data/state/persistence
├─ Wiring notes
├─ Inconsistencies / watch items
├─ QA baseline
└─ Implementation references
```

<a id="44-ai-assistant"></a>

### 4.4 AI assistant

Status: `Unknown / needs audit`

```txt
AI assistant
├─ Current state
├─ User workflows
│  ├─ Reader AI chat
│  ├─ Inline question bar
│  ├─ Notebook chat history
│  ├─ Model/provider selection
│  ├─ BYOK/local provider behavior
│  └─ Quota/gating behavior
├─ Controls and entry points
├─ Platform behavior
├─ Data/state/persistence
├─ Wiring notes
├─ Inconsistencies / watch items
├─ QA baseline
└─ Implementation references
```

<a id="45-search"></a>

### 4.5 Search

Status: `Unknown / needs audit`

```txt
Search
├─ Current state
├─ Search surfaces
│  ├─ Global/app search
│  ├─ Library search
│  ├─ Catalog search
│  ├─ Reader in-book search
│  ├─ Selection search
│  └─ Notebook search
├─ Controls and entry points
├─ Platform behavior
├─ Data/state/persistence
├─ Wiring notes
├─ Inconsistencies / watch items
├─ QA baseline
└─ Implementation references
```

<a id="46-annotations--notes"></a>

### 4.6 Annotations / Notes

Status: `Unknown / needs audit`

```txt
Annotations / Notes
├─ Current state
├─ User workflows
│  ├─ Highlight
│  ├─ Underline/squiggly
│  ├─ Add note
│  ├─ Edit/delete annotation
│  ├─ Export annotations
│  └─ Navigate from note/highlight/bookmark
├─ Controls and entry points
├─ Platform behavior
├─ Data/state/persistence
├─ Wiring notes
├─ Inconsistencies / watch items
├─ QA baseline
└─ Implementation references
```

<a id="47-settings"></a>

### 4.7 Settings

Status: `Current inventory merged`

Settings is the canonical baseline for authenticated Settings routes, Account/Profile, storage, sync, Preferences, BYOK provider keys, platform/MCP API keys, Billing route surfaces, and Reader settings surfaces. Keep this section user-lifecycle focused: what the user can reach, do, wait for, verify, and where behavior is inconsistent.

```txt
Settings
├─ Current state
├─ User workflows
├─ Platform behavior
└─ Inconsistencies / watch items
```

#### Current state

- [ ] Settings is an authenticated `PlatformLayout` route family; signed-out direct access redirects before Settings content renders.
- [ ] `/settings` redirects to `/settings/account`. Direct tab routes are `/settings/account`, `/settings/api-keys`, `/settings/billing`, and `/settings/preferences`.
- [ ] Account renders Profile, Cloud Storage, Sync, and Danger Zone cards.
- [ ] Preferences renders Appearance, Reading, AI Settings, Notifications, Privacy, and Reset Preferences cards.
- [ ] `/settings/api-keys` manages Openread platform/MCP keys through canonical `apps/api` `/api/api-keys`; these are distinct from BYOK model-provider keys in Preferences → AI Settings, which use canonical `apps/api` `/api/settings/api-keys`.
- [ ] Platform/MCP key lifecycle: user creates a show-once `orsk-` key, copies generated external-client config, external MCP client runs `@openread/mcp`, canonical `apps/api` `/api/mcp/auth` exchanges the key for a one-hour JWT, tools access the user's library, `last_used_at` updates, and revocation blocks fresh auth.
- [ ] Billing renders a Free-plan simplified view or a fuller usage/current-plan/payment/invoice/plan-comparison surface from current `useSubscription` wiring.
- [ ] Reader settings are also part of Settings coverage: desktop Reader uses `SettingsDialog`; mobile/iOS Reader uses compact settings sheet/half-sheet controls.
- [ ] Essential persistence/state: theme store owns theme mode/color; `useSettingsStore`/`appService` persist system and Reader settings; notifications use `localStorage.notificationPreferences`; platform/MCP tokens are SHA-256 hashed in `mcp_platform_tokens`; BYOK keys are encrypted in `user_provider_keys`; MCP book content can be cached by the local MCP process.
- [ ] Existing automated coverage includes Settings Chromium smoke, settings component tests, BYOK API tests, MCP auth/config tests, and user export tests.
- [ ] Primary source families: `apps/openread-app/src/app/(platform)/settings/*`, `components/settings/*`, `hooks/useApiKeys.ts`, `hooks/useProviderKeys.ts`, `hooks/useSubscription.ts`, `apps/api/src/routes/api-keys.ts`, `apps/api/src/routes/mcp.ts`, `store/settingsStore.ts`, and `packages/mcp/*`.

#### User workflows

Use this lifecycle rule for every workflow: **start state → important transient state → terminal success/cancel/error state → verification evidence**. Verify terminal states by reload, refreshed row, route/navigation state, downloaded artifact, server/API state, or external-client log.

**How agents should use this section for testing and validation**

- [ ] Treat each SET as a self-contained execution contract: platform requirement, entry path, action, micro-states, post-state effects, downstream impact, guardrails, and evidence.
- [ ] Run only platforms marked `Required`; skip `Not required` platforms and carry the documented reason into the test/run note.
- [ ] Use `Platform paths` when present to choose the correct UI entry path per platform; otherwise use `Platforms`, `Preconditions`, and `Automation notes`.
- [ ] Execute `Controls/actions`, assert `Micro-states`, then verify `Post-state effects`, `Terminal states`, and `Impact coverage` guardrails where present.
- [ ] Attach screenshots only for lifecycle checkpoints by default: start, one observable transient state, and terminal state. Use JSON/text attachments for URL, auth/session, storage/localStorage, network/API, logs, downloaded artifacts, and downstream side effects.
- [ ] Treat `Status: Inconsistent` as a known current-state mismatch to prove and annotate, not as a new regression unless behavior differs from the documented reason.
- [ ] For `Status: Consistent`, a failed assertion must be triaged as product regression, fixture/environment failure, flaky test, or outdated baseline before changing code/docs.
- [ ] When a live service or fixture is required, classify missing Stripe/BYOK/MCP/Ollama/export/storage evidence as blocked or fixture-dependent instead of silently passing.
- [ ] Report each SET result with platform, pass/fail/blocked status, evidence attachment names, observed deviations, and whether the baseline still matches current behavior.

- [ ] Navigate Settings: open from profile/sidebar, direct-open each tab, verify active tab state, verify `/settings` redirect, and verify signed-out redirect behavior.
- [ ] Account/Profile: observe loading/profile state, open Edit Profile, cancel without mutation, save full name, verify toast and metadata/display update, and capture save-error behavior when forced.
- [ ] Storage: verify loading/error/usage states, base/add-on breakdown, over-limit warning, paid-user Add Storage selector, Stripe checkout handoff, active add-ons, and cancel-add-on terminal state.
- [ ] Account sync presentation: verify the former Sync card, Enable Sync toggle, Sync Now action, and opt-in sync copy are absent while Profile, Cloud Storage, and Danger Zone remain usable; validate sync execution through sync worker/API contracts instead of Account settings.
- [ ] Danger Zone: sign out and verify session/navigation state; open Delete Account confirmation, cancel safely, and test actual deletion only with disposable accounts.
- [ ] Preferences/Appearance and Reading: change theme mode/color and reading defaults, verify preview/app shell changes, reload persistence, and Reader default effect.
- [ ] Preferences/AI and BYOK: toggle AI, switch Online/Offline where available, verify Ollama available/unavailable states, verify BYOK gated state, save/test/remove a disposable provider key on Reader/Pro, and confirm saved raw keys are not re-exposed.
- [ ] Preferences/Notifications, Privacy, Reset: toggle notifications, export data/download error states, clear local preferences, reset preferences, and verify the documented reset/clear scope does not remove books, progress, auth, account, billing, or server-side keys.
- [ ] MCP/API keys: verify empty/list/loading states, create disposable key, verify raw key appears only once, copy redacted config, run an external MCP client or inspector against `@openread/mcp`, call `list_books` plus one content/search/navigation tool, refresh for `Last used`, revoke the key, and prove a fresh MCP process fails auth.
- [ ] Billing: verify Free vs paid route surfaces, Available Plans, upgrade anchor, Stripe checkout handoff, portal/manage-plan handoff, cancellation flow with fixture account, invoice empty/list state, payment method state, usage meters, and no AI Boost CTA in Gen 3 v3.
- [ ] Reader settings: open/close desktop dialog and mobile/native sheet, switch panels, verify Search Settings handoff, global-vs-per-book scope, panel reset, invalid Custom CSS recovery, and persistence after reload/reopen.
- [ ] MCP evidence to keep: redacted show-once key, redacted client config, external MCP success/failure log, Settings `Last used` row, revoke confirmation, post-revoke list state, and separate note for already-running MCP/JWT behavior.
- [ ] Conditional fixtures to call out instead of marking missing: Stripe checkout/portal/cancel, Apple/Google IAP source, paid storage add-ons, disposable BYOK key, external MCP client, at least one uploaded book for MCP content proof, and local Ollama server with models.

**User workflow scenarios detailed**

Scenario IDs are intentionally atomic. Do not group multiple user paths under one scenario when adding coverage. Each scenario must explicitly record **Scope**, **Platforms**, **Scenario overview**, **Interaction coverage**, **Impact coverage**, **Preconditions**, **Start state**, **Transient states**, **Terminal states**, **Screenshot evidence**, **Assertions/evidence**, and **Automation notes**. Platform entries stay compact: each platform line carries `Required` or `Not required`, followed by a nested **Status** of `Consistent` or `Inconsistent`. Use `Consistent` when current code wiring supports the platform decision; use `Inconsistent` only when code wiring is missing or contradicted. Include a one-line **Reason** only for `Not required` or `Inconsistent` entries. Screenshot evidence should name stable attachment slots with the scenario ID and state, for example `SET-001-start-app-shell`, so manual evidence can later map to Playwright `testInfo.attach` artifacts. If a branch depends on a live service or fixture, record it in Preconditions or Automation notes rather than marking the scenario missing.

- [ ] **SET-001 — Open Settings from authenticated UI**
  - **Scope:** Navigation/access.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User opens Settings from the authenticated app UI and confirms they land on the Account Settings tab.
  - **Interaction coverage:**
    - **Controls/actions:** Open Settings from the authenticated app UI.
    - **Platform paths:**
      - Desktop web and Tauri desktop use the sidebar/profile-menu Settings entry.
      - Mobile web uses the mobile sidebar/profile Settings entry.
      - Native iOS uses the toolbar/menu bridge to open the mobile sidebar; the Settings entry remains inside authenticated UI.
      - Native Android uses the WebView mobile sidebar/profile Settings entry.
    - **Micro-states:**
      - Authenticated app shell is stable before navigation.
      - Sidebar/profile menu/native menu affordance opens.
      - Settings entry is visible and enabled.
      - Settings entry is activated by pointer, touch, keyboard-equivalent, or native menu bridge where applicable.
      - Route transition/loading may appear.
      - Account Settings route stabilizes.
    - **Post-state effects:**
      - User is on Account Settings.
      - Navigation overlay/menu is dismissed or no longer blocks the page.
      - Authenticated session remains active.
    - **Intersections:**
      - Authenticated user with desktop sidebar/profile entry.
      - Authenticated user with mobile drawer/profile entry.
      - Authenticated user with Tauri desktop shell spacing/titlebar behavior.
      - Authenticated user with native iOS toolbar/menu bridge into mobile sidebar.
      - Authenticated user with native Android WebView mobile navigation/back behavior.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Auth session/token is available.
      - Platform layout renders the correct sidebar/mobile drawer/native menu affordance.
      - Settings route bundle is available.
    - **Direct effects:**
      - Account Settings becomes reachable from authenticated app navigation.
    - **Downstream effects:**
      - Provides the reachable Account Settings base state used by SET-007 through SET-024.
      - Enables follow-on tab switching into API Keys, Billing, and Preferences scenarios.
      - Establishes platform-specific Settings reachability for later Settings validation.
    - **Platform guardrails:**
      - Mobile/native overlays must not block Account Settings after navigation.
      - Tauri titlebar/safe-area spacing must not hide Settings content.
      - Native back/menu behavior must remain usable after navigation.
    - **Must-not-change guardrails:**
      - Opening Settings must not sign the user out.
      - Opening Settings must not mutate profile, storage, sync, billing, API keys, or preferences.
      - Opening Settings must not open destructive dialogs.
      - Opening Settings must not leave mobile/native navigation overlays blocking the Settings page.
  - **Preconditions:** Authenticated user on a platform route with profile/sidebar or native menu access.
  - **Start state:** App shell is stable and Settings is not open.
  - **Transient states:** Platform navigation opens the sidebar/profile menu or native menu affordance; navigation to `/settings/account` may show route loading.
  - **Terminal states:** Success = Account Settings is stable with Account tab active; Cancel = menu dismissed before navigation; Error = route/content fails to render.
  - **Screenshot evidence:**
    - `SET-001-start-open-settings-from-authenticated-ui`
    - Optional: `SET-001-transient-open-settings-from-authenticated-ui if observable`
    - `SET-001-terminal-open-settings-from-authenticated-ui`
  - **Assertions/evidence:**
    - Final URL is `/settings/account`
    - Account tab is active
    - Profile, Cloud Storage, Sync, and Danger Zone cards are visible
    - platform-specific Settings entry affordance is usable.
    - Native iOS Settings menu/toolbar reachability evidence is captured with the native-ios platform run.
  - **Automation notes:** Use the platform's authenticated Settings entry path, attach screenshots at each state, and assert URL plus Account card landmarks.
- [ ] **SET-002 — `/settings` default redirect**
  - **Scope:** Navigation/access.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** Users do not normally direct-enter bare Settings routes in this native shell; native Settings reachability is covered through authenticated UI navigation.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** Users do not normally direct-enter bare Settings routes in this native shell; native Settings reachability is covered through authenticated UI navigation.
  - **Scenario overview:** User opens the base Settings route directly and confirms it resolves to the Account Settings tab.
  - **Interaction coverage:**
    - **Controls/actions:** Navigate directly to `/settings` while authenticated.
    - **Platform paths:**
      - Desktop web opens `/settings` by direct URL, bookmark, reload, or Playwright `page.goto`.
      - Mobile web opens `/settings` by direct URL or test navigation in a mobile viewport.
      - Tauri desktop opens `/settings` through internal route navigation or restored route state.
      - Native iOS is not required for bare direct-route entry; authenticated UI reachability is covered by SET-001.
      - Native Android is not required for bare direct-route entry; authenticated UI reachability is covered by SET-001.
    - **Micro-states:**
      - Authenticated session is available before direct navigation.
      - Bare `/settings` route is requested.
      - Redirect from `/settings` to `/settings/account` runs.
      - Route transition/loading may appear briefly.
      - Account Settings route stabilizes.
    - **Post-state effects:**
      - User lands on `/settings/account`.
      - Account tab is active.
      - Account Settings content is visible.
      - Authenticated session remains active.
    - **Intersections:**
      - Authenticated user with bare Settings route on desktop web.
      - Authenticated user with bare Settings route on mobile web.
      - Authenticated user with bare Settings route in Tauri desktop shell.
      - Native iOS direct-route entry intentionally excluded.
      - Native Android direct-route entry intentionally excluded.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Auth session/token is available.
      - Bare Settings route is registered.
      - Redirect target `/settings/account` is registered.
      - Settings layout and Account tab bundle are available.
    - **Direct effects:**
      - Bare `/settings` normalizes to `/settings/account`.
    - **Downstream effects:**
      - Provides a stable default landing route for Settings links that omit a tab.
      - Keeps Account Settings as the canonical default tab for SET-007 through SET-024.
      - Prevents later tab-specific tests from depending on ambiguous bare Settings state.
    - **Platform guardrails:**
      - Desktop/mobile web redirect must not create a redirect loop.
      - Tauri desktop redirect must preserve shell layout, titlebar spacing, and scrollability.
      - Native iOS/Android remain covered by authenticated UI navigation rather than direct-route expectations.
    - **Must-not-change guardrails:**
      - Redirect must not sign the user out.
      - Redirect must not mutate profile, storage, sync, billing, API keys, or preferences.
      - Redirect must not open dialogs or destructive flows.
      - Redirect must not land on the wrong Settings tab.
  - **Preconditions:** Authenticated user can open or navigate to a direct app route.
  - **Start state:** Browser/app is outside Settings or on a neutral route.
  - **Transient states:** Direct navigation to `/settings` starts; redirect may briefly show route loading.
  - **Terminal states:** Success = route lands on `/settings/account`; Cancel = not applicable; Error = no redirect, wrong tab, blank page, or auth loop.
  - **Screenshot evidence:**
    - `SET-002-start-settings-default-redirect`
    - Optional: `SET-002-transient-settings-default-redirect if observable`
    - `SET-002-terminal-settings-default-redirect`
  - **Assertions/evidence:**
    - Final route is `/settings/account`
    - Account tab is active
    - Account Settings content is visible
    - no redirect loop or persistent intermediate error appears.
  - **Automation notes:** Use direct route navigation to `/settings`, wait for `/settings/account`, attach terminal screenshot, and assert Account tab landmarks.
- [ ] **SET-003 — Direct-load Settings tab URLs**
  - **Scope:** Navigation/access.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** Users do not normally direct-enter bare Settings routes in this native shell; native Settings reachability is covered through authenticated UI navigation.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** Users do not normally direct-enter bare Settings routes in this native shell; native Settings reachability is covered through authenticated UI navigation.
  - **Scenario overview:** User opens each Settings tab URL directly and confirms the URL, active tab, and visible content match.
  - **Interaction coverage:**
    - **Controls/actions:** Directly navigate to `/settings/account`, `/settings/api-keys`, `/settings/billing`, and `/settings/preferences` while authenticated.
    - **Platform paths:**
      - Desktop web and mobile web use direct URL/test navigation for each web tab route, including `/settings/api-keys`.
      - Tauri desktop uses internal route navigation or restored route state for Account, Billing, and Preferences; direct `/settings/api-keys` redirects to Account because API-key management is web-only.
      - Native iOS is not required for direct tab URL entry; authenticated UI/tab reachability plus API Keys absence is covered by SET-001 and SET-004.
      - Native Android is not required for direct tab URL entry; authenticated UI/tab reachability plus API Keys absence is covered by SET-001 and SET-004.
    - **Micro-states:**
      - Authenticated session is established before each direct tab load.
      - Requested tab route starts loading.
      - Settings layout renders tab navigation.
      - Matching tab active state appears.
      - Tab-specific cards/loading/error surfaces settle.
    - **Post-state effects:**
      - URL, active tab, and visible content agree for every supported direct route.
      - Web `/settings/api-keys` opens platform/MCP key management; non-web `/settings/api-keys` redirects to Account.
      - Direct route load does not require first visiting `/settings/account`.
      - Authenticated session remains active across all tab loads.
    - **Intersections:**
      - Account route with Account cards.
      - Web API Keys route with platform/MCP key management.
      - Non-web API Keys direct-route redirect to Account.
      - Billing route with billing surface.
      - Preferences route with settings preference cards.
      - Native direct-route entry intentionally excluded except API Keys absence/redirect expectations.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Auth session/token is available.
      - Settings tab routes and Settings layout are registered.
      - Account, Billing, Preferences, and web-only API Keys page bundles are available.
    - **Direct effects:**
      - Each supported direct route lands on the matching tab without an intermediate user click.
      - Non-web direct API Keys access redirects to Account.
    - **Downstream effects:**
      - Provides route-entry coverage for all Settings feature families.
      - Supports deep links/bookmarks/reloads into tab-specific Settings scenarios.
      - Confirms tab-specific SETs can start from their direct route fixtures.
    - **Platform guardrails:**
      - Web/Tauri direct route loads must preserve layout, safe-area spacing, and scrollability.
      - Non-web API Keys redirects must not expose API-key management UI.
      - Native iOS/Android direct-route exclusion must not remove authenticated UI reachability coverage.
    - **Must-not-change guardrails:**
      - Direct route loading must not sign the user out.
      - Direct route loading must not select the wrong tab or render stale content from a prior tab.
      - Direct route loading must not mutate profile, billing, API keys, preferences, or Reader settings.
      - Direct route loading must not open dialogs or destructive flows.
  - **Preconditions:** Authenticated user can open direct app routes.
  - **Start state:** No Settings tab is open or a different Settings tab is active.
  - **Transient states:** Each direct URL loads its corresponding tab content and any tab-specific loading state.
  - **Terminal states:** Success = each direct URL lands on its matching active tab and expected content; Cancel = not applicable after direct navigation starts; Error = wrong active tab, wrong content, blank state, or route failure.
  - **Screenshot evidence:**
    - `SET-003-start-before-direct-tab-load`
    - `SET-003-terminal-account-tab`
    - `SET-003-terminal-api-keys-tab`
    - `SET-003-terminal-billing-tab`
    - `SET-003-terminal-preferences-tab`
  - **Assertions/evidence:**
    - `/settings/account` shows Account tab and Profile, Cloud Storage, Sync, and Danger Zone cards.
    - `/settings/api-keys` shows API Keys tab and Openread platform/MCP key management on web; non-web direct access redirects to Account and keeps API Keys hidden.
    - `/settings/billing` shows Billing tab and a coherent billing surface.
    - `/settings/preferences` shows Preferences tab and Appearance, Reading, AI Settings, Notifications, Privacy, and Reset cards.
  - **Automation notes:** Implement as parameterized route cases over route, expected active tab, and expected landmarks; attach one terminal screenshot per route.
- [ ] **SET-004 — Switch Settings tabs by pointer**
  - **Scope:** Navigation/access.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User switches between Settings tabs with pointer/touch input and confirms URL, active tab, and visible content stay aligned.
  - **Interaction coverage:**
    - **Controls/actions:** Activate Settings tab links with pointer or touch.
    - **Platform paths:**
      - Desktop web and mobile web click/tap the Settings tab links, including API Keys.
      - Tauri desktop clicks available Settings tab links; API Keys is hidden because API-key management is web-only.
      - Native iOS reaches Settings through the native/menu bridge, then taps available WebView tab links with API Keys hidden.
      - Native Android reaches Settings in the WebView, then taps available mobile tab links with API Keys hidden.
    - **Micro-states:**
      - Starting tab is active.
      - Pointer/touch target is visible and enabled.
      - Tap/click begins route transition.
      - Active tab indicator updates.
      - Destination tab content settles.
    - **Post-state effects:**
      - URL changes to the selected tab route.
      - Active tab and visible cards match the selected route.
      - Prior tab content no longer appears as the primary content.
      - Authenticated session remains active.
    - **Intersections:**
      - Web pointer/touch switching across Account, API Keys, Billing, and Preferences.
      - Non-web pointer/touch switching across Account, Billing, and Preferences with API Keys hidden.
      - Touch switching with mobile tab overflow/scroll.
      - Tauri desktop shell spacing with tab bar visibility.
      - Native iOS/Android WebView touch navigation and back/menu behavior.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Settings layout tab links are rendered.
      - Destination tab routes and page bundles are available.
      - Authenticated user can access Settings.
    - **Direct effects:**
      - User can move between Settings feature families without direct URL entry.
    - **Downstream effects:**
      - Enables manual traversal into Account, Billing, Preferences, and web-only API Keys SETs.
      - Confirms tab active-state semantics used by later route assertions.
      - Confirms non-web Settings keeps API Keys absent from tab navigation.
      - Establishes mobile tab overflow as usable before feature-specific mobile checks.
    - **Platform guardrails:**
      - Mobile tab overflow must remain tappable and not hide destination tabs.
      - Tauri titlebar/safe-area spacing must not cover the tab bar.
      - Native back/menu behavior must remain usable after tab switching.
    - **Must-not-change guardrails:**
      - Tab switching must not sign the user out.
      - Tab switching must not mutate any card data or preferences.
      - Tab switching must not leave two tabs visually active.
      - Tab switching must not leave stale content from the prior tab.
  - **Preconditions:** Authenticated user on any Settings tab.
  - **Start state:** One Settings tab is active.
  - **Transient states:** Pointer click starts route transition and tab active-state update.
  - **Terminal states:** Success = selected tab becomes active with correct content; Cancel = click outside/no navigation leaves current tab unchanged; Error = active tab/content mismatch.
  - **Screenshot evidence:**
    - `SET-004-start-switch-settings-tabs-by-pointer`
    - Optional: `SET-004-transient-switch-settings-tabs-by-pointer if observable`
    - `SET-004-terminal-switch-settings-tabs-by-pointer`
  - **Assertions/evidence:**
    - Before/after URLs differ as expected
    - selected tab is active
    - selected tab content matches the URL.
  - **Automation notes:** Use `click` on tab links, assert route and selected-state after each click, and attach at least one before/after pair.
- [ ] **SET-005 — Switch Settings tabs by keyboard**
  - **Scope:** Navigation/access and platform capability/accessibility.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Not required
      - **Status:** Consistent
      - **Reason:** Keyboard tab switching is not a primary baseline path for this touch/mobile Settings shell.
    - `mobile-web-android`: Not required
      - **Status:** Consistent
      - **Reason:** Keyboard tab switching is not a primary baseline path for this touch/mobile Settings shell.
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** Keyboard tab switching is not a primary baseline path for this touch/mobile Settings shell.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** Keyboard tab switching is not a primary baseline path for this touch/mobile Settings shell.
  - **Scenario overview:** User switches Settings tabs with keyboard input and confirms focus, route, active tab, and visible content stay aligned.
  - **Interaction coverage:**
    - **Controls/actions:** Move keyboard focus to Settings tab links and activate a different tab.
    - **Platform paths:**
      - Desktop web uses Tab/Shift+Tab plus Enter or Space on tab links.
      - Tauri desktop uses the same keyboard path inside the WebView shell.
      - Mobile web and native mobile are not required because keyboard tab switching is not the primary touch/mobile baseline path.
    - **Micro-states:**
      - Focus starts on or before a Settings tab link.
      - Focus-visible state appears on the navigable tab control.
      - Keyboard activation begins route transition.
      - Focus is not trapped or lost during navigation.
      - Destination tab active state and content settle.
    - **Post-state effects:**
      - Final URL matches the keyboard-activated tab.
      - Selected tab has visible active state.
      - Focus remains predictable and recoverable after navigation.
      - Authenticated session remains active.
    - **Intersections:**
      - Desktop browser keyboard accessibility.
      - Windows/Edge focus and high-contrast visibility.
      - Tauri desktop WebView keyboard routing.
      - Touch/mobile platforms intentionally excluded from this keyboard baseline.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Settings tab links are keyboard-focusable anchors.
      - Keyboard events reach the WebView/browser content.
      - Destination tab routes are available.
    - **Direct effects:**
      - Keyboard users can switch Settings feature families without pointer input.
    - **Downstream effects:**
      - Supports accessibility validation for all Settings tabs.
      - Confirms tab active-state assertions do not rely only on pointer interaction.
      - Establishes focus behavior for later dialog/form keyboard checks.
    - **Platform guardrails:**
      - Desktop focus indicators must be visible and not obscured by shell chrome.
      - Tauri desktop must not intercept Tab/Enter/Space in a way that prevents tab activation.
      - Mobile/touch exclusions must remain documented rather than silently skipped.
    - **Must-not-change guardrails:**
      - Keyboard navigation must not activate unintended destructive controls.
      - Keyboard tab switching must not mutate settings data.
      - Keyboard focus must not become trapped outside the active Settings page.
      - Keyboard tab switching must not sign the user out.
  - **Preconditions:** Authenticated user on Settings with keyboard focus available.
  - **Start state:** One Settings tab or nearby focus target is active.
  - **Transient states:** Keyboard navigation activates a different tab link and route transition starts.
  - **Terminal states:** Success = focus and active tab move predictably; Cancel = focus movement without activation does not change content; Error = focus trap, lost focus, or wrong tab.
  - **Screenshot evidence:**
    - `SET-005-start-switch-settings-tabs-by-keyboard`
    - Optional: `SET-005-transient-switch-settings-tabs-by-keyboard if observable`
    - `SET-005-terminal-switch-settings-tabs-by-keyboard`
  - **Assertions/evidence:**
    - Focus path is recorded
    - final URL matches selected tab
    - selected tab has visible active state and content.
  - **Automation notes:** Use keyboard actions such as Tab and Enter/Space, assert focus/route/content, and capture focus-visible screenshots where supported.
- [ ] **SET-006 — Signed-out Settings direct access**
  - **Scope:** Navigation/access and account identity/session.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** Users do not normally direct-enter bare Settings routes in this native shell; native Settings reachability is covered through authenticated UI navigation.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** Users do not normally direct-enter bare Settings routes in this native shell; native Settings reachability is covered through authenticated UI navigation.
  - **Scenario overview:** User opens a Settings URL while signed out and confirms they are redirected to auth before Settings content is visible.
  - **Interaction coverage:**
    - **Controls/actions:** Open a protected Settings URL with no authenticated session.
    - **Platform paths:**
      - Desktop web, mobile web, and Tauri desktop use a cleared session/storage context and direct route navigation.
      - Native iOS direct signed-out Settings URL entry is not required; native reachability starts from authenticated UI.
      - Native Android direct signed-out Settings URL entry is not required; native reachability starts from authenticated UI.
    - **Micro-states:**
      - Session/token is absent before navigation.
      - Protected Settings route is requested.
      - Auth guard runs before Settings content stabilizes.
      - Redirect to auth route occurs.
      - Settings cards remain absent in the signed-out terminal state.
    - **Post-state effects:**
      - User lands on the auth redirect, currently `/auth?redirect=/home`.
      - Requested Settings tab intent is not preserved.
      - No authenticated Settings data is exposed.
      - Session remains signed out.
    - **Intersections:**
      - Signed-out direct Account tab route.
      - Signed-out protected Settings route on desktop/mobile web.
      - Signed-out protected Settings route in Tauri desktop shell.
      - Native direct-route entry intentionally excluded.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Auth storage/session can be cleared.
      - Platform layout auth guard is active.
      - Auth route is available.
    - **Direct effects:**
      - Protected Settings content is blocked for signed-out users.
    - **Downstream effects:**
      - Establishes auth protection for all Settings tabs and feature cards.
      - Confirms SET-007 through SET-060 require authenticated fixtures.
      - Captures the known redirect-intent caveat for future auth-routing fixes.
    - **Platform guardrails:**
      - Web/Tauri redirects must not flash protected Settings content.
      - Native iOS/Android Settings reachability remains covered through authenticated UI paths.
    - **Must-not-change guardrails:**
      - Signed-out access must not render Profile, Storage, Sync, API Keys, Billing, Preferences, or Reader Settings content.
      - Signed-out access must not create a redirect loop.
      - Signed-out access must not create or mutate local/server Settings data.
      - Signed-out access must not leave stale authenticated UI visible from a prior session.
  - **Preconditions:** Signed-out browser/session.
  - **Start state:** A direct Settings URL is entered while no active session exists.
  - **Transient states:** Auth guard checks session and redirects before Settings content stabilizes.
  - **Terminal states:** Success = signed-out user lands on auth redirect and Settings content is protected; Cancel = not applicable; Error = protected Settings content renders or redirect loops.
  - **Screenshot evidence:**
    - `SET-006-start-signed-out-settings-direct-access`
    - Optional: `SET-006-transient-signed-out-settings-direct-access if observable`
    - `SET-006-terminal-signed-out-settings-direct-access`
  - **Assertions/evidence:**
    - Original requested Settings URL is recorded
    - final URL is the auth redirect
    - Settings cards are absent from the signed-out terminal state.
    - Known routing caveat: signed-out `/settings/*` currently redirects to `/auth?redirect=/home`, so requested tab intent is not preserved.
  - **Automation notes:** Use a cleared storage/session context, `page.goto('/settings/account')`, assert redirect target and absence of protected Settings landmarks.
- [ ] **SET-007 — Profile loading and read-only display**
  - **Scope:** Account identity/session.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User opens Account Settings and confirms the Profile card resolves from loading into the correct read-only identity display.
  - **Interaction coverage:**
    - **Controls/actions:** Open Account Settings and observe the Profile card without editing it.
    - **Platform paths:**
      - All required Settings platforms use the Account tab Profile card.
      - Mobile/native platforms must keep avatar/name/email readable within safe-area and narrow layout constraints.
    - **Micro-states:**
      - Account tab starts before profile data is fully resolved.
      - Profile skeleton/loading placeholders may render.
      - User metadata resolves.
      - Avatar or fallback avatar renders.
      - Display name fallback and email visibility are correct.
    - **Post-state effects:**
      - Profile card shows read-only identity information.
      - Edit Profile control remains available for follow-on edit scenarios.
      - No profile update request is sent in this read-only scenario.
    - **Intersections:**
      - Authenticated user with complete profile metadata.
      - Authenticated user with missing display name/full name fallback.
      - Slow profile/auth hydration fixture.
      - Mobile/narrow layout identity display.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Auth context exposes user metadata and email.
      - ProfileSection can render loading, fallback, and resolved states.
      - UserAvatar can render image or fallback safely.
    - **Direct effects:**
      - User can verify current account identity before making profile changes.
    - **Downstream effects:**
      - Establishes the baseline values used by SET-008, SET-009, and SET-010.
      - Confirms Account Settings identity state before destructive/account actions.
      - Provides a guardrail for later profile mutation checks.
    - **Platform guardrails:**
      - Mobile/native layouts must not truncate identity so severely that account cannot be recognized.
      - Tauri/native safe areas must not hide the Profile card header or Edit Profile control.
    - **Must-not-change guardrails:**
      - Loading/read-only display must not mutate profile metadata.
      - Loading/read-only display must not sign the user out.
      - Loading/read-only display must not open Edit Profile automatically.
      - Loading/read-only display must not mask email with another user's data.
  - **Preconditions:** Authenticated user with profile metadata available or slow-network fixture.
  - **Start state:** Account tab is opening and profile data may be unknown.
  - **Transient states:** Profile skeleton/loading state resolves to authenticated profile display.
  - **Terminal states:** Success = avatar/name/email render with expected fallback behavior; Cancel = not applicable; Error = perpetual loading or incorrect identity data.
  - **Screenshot evidence:**
    - `SET-007-start-profile-loading-and-read-only-display`
    - Optional: `SET-007-transient-profile-loading-and-read-only-display if observable`
    - `SET-007-terminal-profile-loading-and-read-only-display`
  - **Assertions/evidence:**
    - Profile card shows avatar/fallback, display name or fallback copy, and email
    - no edit mutation occurs in this read-only scenario.
  - **Automation notes:** Use a profile fixture and optional delayed profile response for loading capture; assert final profile card values before attaching terminal screenshot.
- [ ] **SET-008 — Edit Profile cancel**
  - **Scope:** Account identity/session.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User opens Edit Profile, changes the draft full name, cancels, and confirms no profile data is saved.
  - **Interaction coverage:**
    - **Controls/actions:** Click Edit Profile, modify Full Name, then cancel/close without submitting.
    - **Platform paths:**
      - All required Settings platforms use the Profile card Edit Profile button and dialog.
      - Mobile/native platforms validate dialog fit, keyboard behavior, and dismiss affordance.
    - **Micro-states:**
      - Profile card is stable before editing.
      - Edit Profile dialog opens with email disabled and full name prefilled.
      - User changes draft full name locally.
      - Cancel or close dismisses the dialog.
      - Profile card reappears with original values.
    - **Post-state effects:**
      - Draft changes are discarded.
      - No success toast appears.
      - No profile update request should be recorded.
      - Authenticated session remains active.
    - **Intersections:**
      - Existing display name/full name draft.
      - Empty or changed full name draft canceled.
      - Dialog cancel by button, close affordance, or escape/back where supported.
      - Mobile keyboard opened then dismissed before cancel.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Profile card and EditProfileDialog render for the authenticated user.
      - Dialog form can hold unsaved local draft state.
      - Supabase profile update is not invoked on cancel.
    - **Direct effects:**
      - User can abandon profile edits without mutation.
    - **Downstream effects:**
      - Preserves SET-007 baseline identity for later save/failure scenarios.
      - Confirms cancel semantics before destructive/account dialog tests.
      - Protects profile metadata used across app shell/avatar displays.
    - **Platform guardrails:**
      - Mobile/native dialogs must remain dismissible after keyboard input.
      - Desktop focus must return to a sensible Profile card control after cancel.
    - **Must-not-change guardrails:**
      - Cancel must not update Supabase auth metadata.
      - Cancel must not change displayed name/email/avatar.
      - Cancel must not sign the user out or navigate away.
      - Cancel must not affect storage, sync, billing, API keys, or preferences.
  - **Preconditions:** Authenticated user on Account tab.
  - **Start state:** Profile card is stable with current display name/email.
  - **Transient states:** Edit dialog opens; user changes name locally; Cancel closes dialog.
  - **Terminal states:** Success = no profile mutation occurs; Cancel = dialog closes with original card unchanged; Error = canceled draft persists to server/display.
  - **Screenshot evidence:**
    - `SET-008-start-edit-profile-cancel`
    - Optional: `SET-008-transient-edit-profile-cancel if observable`
    - `SET-008-terminal-edit-profile-cancel`
  - **Assertions/evidence:**
    - Before/canceled-after profile display and absence of success toast/mutation.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-009 — Edit Profile save success**
  - **Scope:** Account identity/session.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User updates their full name in Edit Profile and confirms the saved profile display persists after reload.
  - **Interaction coverage:**
    - **Controls/actions:** Open Edit Profile, change Full Name, submit Save Changes, and reload to verify persistence.
    - **Platform paths:**
      - All required Settings platforms use the Profile card Edit Profile dialog and Save Changes button.
      - Mobile/native platforms validate keyboard entry, submit affordance, dialog close, and safe-area visibility.
    - **Micro-states:**
      - Dialog opens with current profile values.
      - Full Name input becomes dirty with a valid changed value.
      - Save Changes enters Saving/submitting state.
      - Profile update succeeds and dialog closes.
      - Profile card refreshes with the saved display name.
    - **Post-state effects:**
      - Success/info toast is visible.
      - Supabase user metadata/display name reflects the changed full name.
      - Reload keeps the updated profile display.
      - Email and session remain unchanged.
    - **Intersections:**
      - Changed non-empty full name.
      - Existing display name replaced by saved full name.
      - Desktop and mobile dialog submit behavior.
      - Reload/re-hydration after successful profile update.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Authenticated user can update Supabase auth metadata.
      - ProfileSection reads updated user metadata after save/reload.
      - Toast/event dispatcher can surface the success state.
    - **Direct effects:**
      - User profile display name is updated for the account.
    - **Downstream effects:**
      - App shell/profile surfaces that use user metadata should reflect the new name after refresh.
      - SET-007 read-only display should now show the updated baseline value.
      - Future account/delete/session checks should still identify the same authenticated account.
    - **Platform guardrails:**
      - Mobile/native keyboard submit must not obscure the save result.
      - Tauri/native reload/reopen must preserve the saved account metadata once rehydrated.
    - **Must-not-change guardrails:**
      - Save must not change email or auth provider identity.
      - Save must not affect storage quota, sync settings, billing, API keys, or preferences.
      - Save must not leave stale dialog state after success.
      - Save must not sign the user out.
  - **Preconditions:** Authenticated user on Account tab.
  - **Start state:** Edit Profile dialog is open with a valid changed full name.
  - **Transient states:** Save submits profile update and button/dialog may show submitting state.
  - **Terminal states:** Success = dialog closes or stabilizes, success toast appears, profile metadata/display refreshes; Cancel = not applicable after submit; Error = failure toast/state appears without false success.
  - **Screenshot evidence:**
    - `SET-009-start-edit-profile-save-success`
    - Optional: `SET-009-transient-edit-profile-save-success if observable`
    - `SET-009-terminal-edit-profile-save-success`
  - **Assertions/evidence:**
    - Toast, before/after profile display, and reload persistence.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-010 — Edit Profile save failure**
  - **Scope:** Account identity/session.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User attempts to save a profile name change, the save fails, and the prior profile data remains authoritative.
  - **Interaction coverage:**
    - **Controls/actions:** Open Edit Profile, change Full Name, submit Save Changes under a forced failure, then dismiss or retry safely.
    - **Platform paths:**
      - All required Settings platforms use the Profile card Edit Profile dialog.
      - Mobile/native platforms validate keyboard entry, failure toast visibility, and dialog/dismiss behavior.
    - **Micro-states:**
      - Dialog opens with current profile values.
      - Full Name draft changes locally.
      - Save Changes enters Saving/submitting state.
      - Supabase/network/API failure is returned.
      - Failure toast/copy appears and prior profile data remains authoritative.
    - **Post-state effects:**
      - Profile card does not show the failed draft as saved data.
      - Prior metadata remains after reload/refetch.
      - User can retry or dismiss without partial mutation.
      - Authenticated session remains active.
    - **Intersections:**
      - Forced auth metadata update failure.
      - Network/API error path.
      - Dialog remaining open or dismissing after error.
      - Mobile keyboard plus failure feedback visibility.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Failure fixture intercepts or forces the profile update request to fail.
      - Toast/event dispatcher surfaces failure copy.
      - ProfileSection can re-render preserved metadata.
    - **Direct effects:**
      - Failed profile update is visible and non-destructive.
    - **Downstream effects:**
      - Protects app shell/avatar/profile consumers from accepting failed draft data.
      - Confirms account remains usable for later Settings scenarios after profile failure.
      - Provides failure semantics for profile mutation tests.
    - **Platform guardrails:**
      - Failure feedback must be visible on mobile/native after keyboard dismissal.
      - Desktop/Tauri focus should remain recoverable after failure.
    - **Must-not-change guardrails:**
      - Failure must not update Supabase auth metadata.
      - Failure must not change email/session state.
      - Failure must not mutate storage, sync, billing, API keys, or preferences.
      - Failure must not leave the user in a broken navigation state.
  - **Preconditions:** Authenticated user with forced network/API failure fixture.
  - **Start state:** Edit Profile dialog is open with a valid changed full name.
  - **Transient states:** Save submits and request fails.
  - **Terminal states:** Success = not applicable for failure fixture; Cancel = user can dismiss/close without mutation; Error = visible failure copy/toast and previous profile remains authoritative.
  - **Screenshot evidence:**
    - `SET-010-start-edit-profile-save-failure`
    - Optional: `SET-010-transient-edit-profile-save-failure if observable`
    - `SET-010-terminal-edit-profile-save-failure`
  - **Assertions/evidence:**
    - Error copy/toast, preserved profile display, and retry/dismiss behavior.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-011 — Storage quota loading**
  - **Scope:** Cloud/sync and entitlement/billing/quota.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User opens Account Settings and confirms the Cloud Storage card shows a loading state before resolving to usage or error.
  - **Interaction coverage:**
    - **Controls/actions:** Open Account Settings with a delayed storage quota response and observe the Cloud Storage card.
    - **Platform paths:**
      - All required Settings platforms use the Account tab Cloud Storage card.
      - Mobile/native platforms validate skeleton layout within narrow/safe-area constraints.
    - **Micro-states:**
      - Account tab starts before quota data resolves.
      - Cloud Storage card header and loading skeletons render.
      - Quota request remains pending long enough for capture.
      - Loading resolves to either usage or documented error state.
    - **Post-state effects:**
      - Loading state is temporary and visually stable.
      - No misleading zero quota is shown while data is pending.
      - User remains on Account Settings.
      - Authenticated session remains active.
    - **Intersections:**
      - Slow quota API response.
      - Account tab layout with Profile above and Sync/Danger Zone below.
      - Mobile/narrow skeleton rendering.
      - Transition from loading to resolved usage or error.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - `useStorageQuota` enters `isLoading` before quota data resolves.
      - Skeleton component renders in StorageSection.
      - Auth token is available for quota fetch.
    - **Direct effects:**
      - User receives explicit feedback that cloud storage information is loading.
    - **Downstream effects:**
      - Establishes loading semantics before SET-012 usage and SET-013 error validation.
      - Prevents later quota assertions from treating pending data as final data.
      - Confirms Account tab remains stable while storage data is pending.
    - **Platform guardrails:**
      - Mobile/native skeletons must not overlap adjacent cards or safe areas.
      - Tauri/native shells must preserve scrollability while loading.
    - **Must-not-change guardrails:**
      - Loading must not mutate quota/add-on state.
      - Loading must not hide Profile, Sync, or Danger Zone permanently.
      - Loading must not sign the user out.
      - Loading must not trigger checkout or cancellation actions.
  - **Preconditions:** Authenticated user with slow quota fixture.
  - **Start state:** Account tab opens before quota data resolves.
  - **Transient states:** Cloud Storage card shows loading/skeleton/pending state.
  - **Terminal states:** Success = loading resolves into usage or error state; Cancel = navigating away stops user interaction safely; Error = stuck loading or layout break.
  - **Screenshot evidence:**
    - `SET-011-start-storage-quota-loading`
    - Optional: `SET-011-transient-storage-quota-loading if observable`
    - `SET-011-terminal-storage-quota-loading`
  - **Assertions/evidence:**
    - Loading capture and resolved state.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-012 — Storage usage and breakdown**
  - **Scope:** Cloud/sync and entitlement/billing/quota.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User views Cloud Storage usage and confirms displayed usage, base quota, add-on quota, and active add-ons match the fixture.
  - **Interaction coverage:**
    - **Controls/actions:** View the resolved Cloud Storage card and compare usage/breakdown values to the quota fixture.
    - **Platform paths:**
      - All required Settings platforms use the Account tab Cloud Storage card.
      - Mobile/native platforms validate wrapping of usage, percent, breakdown, and add-on rows.
    - **Micro-states:**
      - Loading has completed.
      - Used bytes, total GB, percent, and progress bar render.
      - Base plan quota and add-on quota breakdown render.
      - Active add-on rows render when present.
      - Optional over-limit warning is absent unless fixture is over limit.
    - **Post-state effects:**
      - Displayed usage accurately reflects fixture/API data.
      - Quota card remains read-only unless Add Storage or Cancel is separately invoked.
      - Account Settings remains stable and scrollable.
    - **Intersections:**
      - Free/base quota fixture.
      - Paid quota fixture.
      - Add-on quota contribution fixture.
      - Active add-on row fixture.
      - Normal non-error quota response.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - `useStorageQuota` returns quota data.
      - StorageSection formats bytes, percent, plan label, and add-on rows.
      - Quota fixture includes base/add-on/active-add-on values where applicable.
    - **Direct effects:**
      - User can understand current cloud storage consumption and entitlement.
    - **Downstream effects:**
      - Provides baseline quota state for over-limit, add-storage, active-add-on, and cancel-add-on scenarios.
      - Confirms billing/entitlement data shown in Account aligns with storage add-on flows.
      - Supports guardrails for reset/sign-out/delete flows that must not corrupt quota display.
    - **Platform guardrails:**
      - Progress bar and breakdown must remain readable on mobile/native widths.
      - Tauri/native scroll and safe-area spacing must not hide active add-on rows.
    - **Must-not-change guardrails:**
      - Viewing quota must not start checkout or cancel add-ons.
      - Viewing quota must not mutate stored books, sync state, billing, or preferences.
      - Viewing quota must not show stale add-on data after fixture refresh.
      - Viewing quota must not sign the user out.
  - **Preconditions:** Authenticated user with normal quota response.
  - **Start state:** Cloud Storage card has loaded.
  - **Transient states:** Usage values, base quota, add-on quota, and optional active add-ons render.
  - **Terminal states:** Success = usage/breakdown match fixture; Cancel = not applicable; Error = missing/incorrect quota copy.
  - **Screenshot evidence:**
    - `SET-012-start-storage-usage-and-breakdown`
    - Optional: `SET-012-transient-storage-usage-and-breakdown if observable`
    - `SET-012-terminal-storage-usage-and-breakdown`
  - **Assertions/evidence:**
    - Quota card capture and fixture/API values.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-013 — Storage quota error**
  - **Scope:** Cloud/sync and entitlement/billing/quota.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User opens Cloud Storage while quota loading fails and confirms the error state is visible and non-destructive.
  - **Interaction coverage:**
    - **Controls/actions:** Open Account Settings with a forced quota failure and observe the Cloud Storage error state.
    - **Platform paths:**
      - All required Settings platforms use the Account tab Cloud Storage card.
      - Mobile/native platforms validate error copy visibility without layout break.
    - **Micro-states:**
      - Cloud Storage begins in loading or refresh state.
      - Quota request fails or returns unusable data.
      - Error copy appears in the Cloud Storage card.
      - Usage/progress/add-on rows are not shown as if valid.
      - User can continue using other Account cards.
    - **Post-state effects:**
      - Error state is visible and non-destructive.
      - No quota/add-on data is overwritten with misleading zero values.
      - Account Settings remains reachable.
      - Authenticated session remains active.
    - **Intersections:**
      - Network failure fixture.
      - API error response fixture.
      - Missing/invalid quota payload fixture.
      - Mobile/narrow error card layout.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - `useStorageQuota` exposes error or missing quota state.
      - StorageSection renders the storage error branch.
      - Account tab can continue rendering adjacent cards.
    - **Direct effects:**
      - User is told storage information failed to load instead of seeing false quota data.
    - **Downstream effects:**
      - Prevents add-storage/cancel-add-on scenarios from starting from invalid quota state.
      - Provides fixture classification for storage-service failures.
      - Confirms Account Settings remains usable even when quota service fails.
    - **Platform guardrails:**
      - Mobile/native error copy must remain visible without blocking other cards.
      - Tauri/native shells must not convert quota service failure into a blank route.
    - **Must-not-change guardrails:**
      - Error state must not mutate quota/add-on state.
      - Error state must not trigger checkout, cancellation, sync, or profile changes.
      - Error state must not sign the user out.
      - Error state must not hide destructive controls in a misleading way.
  - **Preconditions:** Authenticated user with forced quota API failure.
  - **Start state:** Cloud Storage card is loading or refreshing.
  - **Transient states:** Quota request fails and error UI appears.
  - **Terminal states:** Success = error state is visible and non-destructive; Cancel = user can leave Account safely; Error = blank card or misleading zero-usage state.
  - **Screenshot evidence:**
    - `SET-013-start-storage-quota-error`
    - Optional: `SET-013-transient-storage-quota-error if observable`
    - `SET-013-terminal-storage-quota-error`
  - **Assertions/evidence:**
    - Error copy and absence of corrupted quota values.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-014 — Storage over-limit warning**
  - **Scope:** Cloud/sync and entitlement/billing/quota.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User views Cloud Storage while usage is above quota and confirms the over-limit warning is visible and accurate.
  - **Interaction coverage:**
    - **Controls/actions:** View the Cloud Storage card with an over-limit quota fixture.
    - **Platform paths:**
      - All required Settings platforms use the Account tab Cloud Storage card.
      - Mobile/native platforms validate over-limit warning visibility and wrapping.
    - **Micro-states:**
      - Quota response resolves with percent used above allowed quota.
      - Usage color/progress indicates high or over-limit usage.
      - Over-limit warning copy appears.
      - Base/add-on quota values remain accurate.
      - Add Storage affordance remains separate from the warning when eligible.
    - **Post-state effects:**
      - User sees an explicit exceeded-storage warning.
      - Usage and quota data remain accurate.
      - No automatic checkout or data deletion starts.
    - **Intersections:**
      - Over-limit free/base quota fixture.
      - Over-limit paid/add-on quota fixture.
      - Warning plus Add Storage eligibility.
      - Warning on mobile/narrow layouts.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Quota fixture sets `is_over_limit` and percent above threshold.
      - StorageSection renders warning branch and progress color correctly.
      - Current plan/add-on data is available for context.
    - **Direct effects:**
      - User receives actionable warning that storage limit is exceeded.
    - **Downstream effects:**
      - Provides a starting state for add-storage recovery paths.
      - Confirms storage entitlement warnings do not corrupt billing or library state.
      - Helps classify storage failures versus legitimate over-limit state.
    - **Platform guardrails:**
      - Warning must remain visible on mobile/native without covering controls.
      - Tauri/native safe-area and scrolling must keep warning reachable.
    - **Must-not-change guardrails:**
      - Warning display must not delete files or mutate quota.
      - Warning display must not automatically start checkout.
      - Warning display must not hide existing add-on data.
      - Warning display must not sign the user out.
  - **Preconditions:** Authenticated user fixture above allowed storage.
  - **Start state:** Cloud Storage card has loaded usage above quota.
  - **Transient states:** Over-limit calculation renders warning state.
  - **Terminal states:** Success = warning copy/action is visible and usage remains accurate; Cancel = not applicable; Error = over-limit account appears healthy.
  - **Screenshot evidence:**
    - `SET-014-start-storage-over-limit-warning`
    - Optional: `SET-014-transient-storage-over-limit-warning if observable`
    - `SET-014-terminal-storage-over-limit-warning`
  - **Assertions/evidence:**
    - Over-limit warning and usage/quota values.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-015 — Storage tier-only no add-on checkout**
  - **Scope:** Cloud/sync and entitlement/billing/quota.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** Paid users see storage as included in their plan and cannot start a separate storage add-on checkout.
  - **Interaction coverage:**
    - **Controls/actions:** View the Account tab Cloud Storage card and verify no Add Storage CTA, add-on selector, or checkout handoff is available.
    - **Platform paths:** All required Settings platforms use the Account tab Cloud Storage card; native/Tauri may additionally prove the disabled endpoint through controller evidence.
    - **Micro-states:** Quota resolves, tier allowance copy appears, no add-on checkout controls render, direct storage checkout endpoint is disabled.
    - **Post-state effects:** Viewing storage does not mutate quota, create checkout sessions, or leave Settings.
    - **Intersections:** Paid Reader/Pro tier fixtures, direct endpoint hardening, mobile/native narrow layout.
  - **Impact coverage:**
    - **Upstream dependencies:** Tier config exposes standard storage only; quota API returns no available add-ons.
    - **Direct effects:** User understands storage is bundled into their plan.
    - **Downstream effects:** Billing surfaces do not expose separate storage add-on purchases.
    - **Platform guardrails:** No hidden or offscreen Add Storage control should remain reachable on mobile/native.
    - **Must-not-change guardrails:** Removing add-ons must not affect profile, sync, API keys, preferences, books, or sign-in state.
  - **Preconditions:** Paid eligible user with standard tier storage.
  - **Start state:** Cloud Storage card is loaded.
  - **Transient states:** Not applicable; no add-on checkout flow exists.
  - **Terminal states:** Success = tier storage copy is visible and Add Storage/checkout is absent; Error = add-on checkout still appears or endpoint accepts checkout.
  - **Screenshot evidence:**
    - `SET-015-start-storage-tier-only-no-add-on-checkout`
    - `SET-015-terminal-storage-tier-only-no-add-on-checkout`
  - **Assertions/evidence:**
    - No Add Storage UI, no add-on selector, checkout endpoint disabled when directly probed.
  - **Automation notes:** Use deterministic quota fixtures and attach screenshots for start/terminal states.
- [ ] **SET-016 — Tier storage limit display**
  - **Scope:** Cloud/sync and entitlement/billing/quota.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User views the Cloud Storage card and confirms the quota total comes from the plan tier only.
  - **Interaction coverage:**
    - **Controls/actions:** View resolved storage usage and the “Up to X GB” tier allowance copy.
    - **Platform paths:** All required Settings platforms use the Account tab Cloud Storage card.
    - **Micro-states:** Quota response resolves with base_gb, addon_gb remains 0, total matches the tier allowance, no active add-on rows render.
    - **Post-state effects:** Viewing the card does not mutate quota or billing state.
    - **Intersections:** Reader and Pro tier storage totals, mobile/native rendering, high usage values near quota.
  - **Impact coverage:**
    - **Upstream dependencies:** Tier config is the source of storage_gb for Free/Reader/Pro.
    - **Direct effects:** User sees the correct included storage limit for the current plan.
    - **Downstream effects:** Upload enforcement and billing surfaces agree on the same tier-only quota.
    - **Platform guardrails:** Usage values and “Up to X GB” copy remain readable on narrow/mobile/native layouts.
    - **Must-not-change guardrails:** Displaying storage must not introduce add-on rows, checkout CTAs, or cancellation controls.
  - **Preconditions:** User fixture with standard tier storage.
  - **Start state:** Account Storage card has loaded.
  - **Transient states:** Quota loading resolves to tier-only usage.
  - **Terminal states:** Success = usage total and “Up to X GB” copy match the plan tier; Error = add-on contribution or stale add-on row appears.
  - **Screenshot evidence:**
    - `SET-016-start-tier-storage-limit-display`
    - `SET-016-terminal-tier-storage-limit-display`
  - **Assertions/evidence:**
    - Tier storage quota total, “Up to X GB” copy, no active add-ons.
  - **Automation notes:** Use deterministic fixtures for Reader and Pro where possible.
- [ ] **SET-017 — Storage add-on cancel disabled**
  - **Scope:** Cloud/sync and entitlement/billing/quota.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User cannot cancel storage add-ons from Settings because separate add-ons are not part of the product model.
  - **Interaction coverage:**
    - **Controls/actions:** View the Account tab Cloud Storage card and verify no Active Add-ons section or Cancel control appears.
    - **Platform paths:** All required Settings platforms use the Account tab Cloud Storage card; controller evidence may probe disabled cancel endpoint.
    - **Micro-states:** Quota resolves with empty active_addons, no add-on rows render, direct cancel endpoint is disabled.
    - **Post-state effects:** Viewing storage does not mutate quota or billing state.
    - **Intersections:** No-add-on baseline, direct endpoint hardening, mobile/native tap targets.
  - **Impact coverage:**
    - **Upstream dependencies:** Quota API returns empty active_addons and addon_gb 0.
    - **Direct effects:** No storage add-on cancellation path is exposed.
    - **Downstream effects:** Billing/storage state remains tier-only and cannot be altered through stale cancel controls.
    - **Platform guardrails:** No hidden cancel affordance should remain reachable on mobile/native/Tauri shells.
    - **Must-not-change guardrails:** Disabled cancellation must not affect profile, sync, API keys, preferences, books, or sign-in state.
  - **Preconditions:** User fixture with tier-only storage and no active add-ons.
  - **Start state:** Cloud Storage card is loaded.
  - **Transient states:** Not applicable; no cancellation flow exists.
  - **Terminal states:** Success = no active add-on rows/cancel controls and cancel endpoint disabled; Error = stale add-on row or cancel path remains.
  - **Screenshot evidence:**
    - `SET-017-start-storage-add-on-cancel-disabled`
    - `SET-017-terminal-storage-add-on-cancel-disabled`
  - **Assertions/evidence:**
    - No Active Add-ons section, no Cancel control, cancel endpoint disabled when directly probed.
  - **Automation notes:** Use deterministic quota fixtures and attach screenshots for start/terminal states.
- [ ] **SET-018 — Manual Account sync controls removed**
  - **Scope:** Account settings sync presentation and canonical automatic-sync copy.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** Account Settings shows Profile, Cloud Storage, and Danger Zone without the former Account-level Sync card or Enable Sync toggle.
  - **Interaction coverage:**
    - **Controls/actions:** Open Account Settings and verify the former manual Sync controls are absent while the remaining Account sections stay usable.
    - **Platform paths:**
      - All required Settings platforms use the Account tab.
      - Mobile/native platforms validate the same webview-rendered Account surface in narrow/touch layouts.
    - **Micro-states:**
      - Account Settings route loads for an authenticated user.
      - Profile section is visible.
      - Cloud Storage section is visible.
      - Danger Zone section is visible.
      - Former Sync card heading/control text is absent.
      - Former Enable Sync control is absent.
    - **Post-state effects:**
      - Account Settings no longer exposes user-controlled sync enablement.
      - Signed-in sync remains an automatic/background product behavior outside this Account card.
      - Cloud Storage quota presentation remains available.
    - **Intersections:**
      - Desktop Settings layout.
      - Mobile Settings layout.
      - Tauri/native webview Settings layout.
      - Authenticated Account page load.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Authenticated Account Settings route is reachable.
      - Profile, Cloud Storage, and Danger Zone sections render independently of the removed sync UI component.
    - **Direct effects:**
      - User cannot toggle sync from Account Settings.
      - `keepLogin` is no longer presented as sync enablement in Account UI.
    - **Downstream effects:**
      - Account QA contract aligns with automatic sync for signed-in users and local-only behavior for signed-out users.
      - Sync worker/outbox/API/backend behavior remains out of scope and unchanged.
      - SET-019/SET-020 validate absence of former manual Sync Now and opt-in copy rather than executing sync.
    - **Platform guardrails:**
      - Removing the card must not break Account navigation, Cloud Storage quota display, profile editing, sign out, or delete-account flows.
      - Mobile/native/Tauri shells must not retain a stale Sync card through cached webview routes.
    - **Must-not-change guardrails:**
      - Do not remove or rewrite sync worker, outbox, `/api/sync`, Supabase sync schema, R2/cloud storage behavior, or baseRevision lifecycle.
      - Do not add temporary overlay/hide-only behavior that leaves reachable manual sync controls.
      - Do not mutate profile, storage quota, billing, API keys, books, or preferences while verifying absence.
  - **Preconditions:** Authenticated user on Account tab.
  - **Start state:** Account Settings route is loaded.
  - **Transient states:** Not applicable; the removed manual controls should never render.
  - **Terminal states:** Success = Profile, Cloud Storage, and Danger Zone are visible and former Sync card/Enable Sync controls are absent; Error = any former manual Sync control remains reachable.
  - **Screenshot evidence:**
    - `SET-018-start-account-sync-controls-removed`
    - `SET-018-terminal-account-sync-controls-removed`
  - **Assertions/evidence:**
    - Absence of `Sync` card heading, `Enable Sync`, `Sync Now`, `Sign in to enable sync`, `Sync your books and reading progress to the cloud`, and `Keep your library synced across devices`.
    - Presence of Profile, Cloud Storage, and Danger Zone.
  - **Automation notes:** Use deterministic authenticated settings fixtures, attach Account screenshots for start/terminal states, and assert absence before cleanup.
- [ ] **SET-019 — Account Sync Now action removed**
  - **Scope:** Account settings sync presentation and manual action removal.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** Account Settings does not expose the former manual Sync Now action; sync is not user-triggered from Account settings.
  - **Interaction coverage:**
    - **Controls/actions:** Open Account Settings and verify no Sync Now button/action is present.
    - **Platform paths:**
      - All required Settings platforms use the Account tab.
      - Mobile/native platforms validate no hidden or offscreen Sync Now action remains reachable.
    - **Micro-states:**
      - Account page is stable for an authenticated user.
      - Profile section remains visible.
      - Cloud Storage section remains visible.
      - Former Sync Now action is absent from buttons and text.
      - No sync status/spinner is introduced by opening Account Settings.
    - **Post-state effects:**
      - Opening Account Settings does not manually start sync.
      - No sync cursor/status metadata is mutated by a removed Account button.
      - Authenticated session remains active.
    - **Intersections:**
      - Former manual sync execution path.
      - Automatic signed-in sync messaging.
      - Desktop/mobile/native Account layouts.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Authenticated Account Settings route is reachable.
      - Sync worker behavior remains owned by app/background sync, not Account UI.
    - **Direct effects:**
      - User cannot trigger a manual sync from Account Settings.
    - **Downstream effects:**
      - QA no longer treats Account Settings as a manual sync execution surface.
      - Sync success/failure behavior should be covered by sync worker/API contracts, not this Account UI cell.
    - **Platform guardrails:**
      - No offscreen, hidden, or native-webview-only Sync Now button may remain.
      - Removing Sync Now must not affect profile, Cloud Storage, Danger Zone, billing, preferences, or account identity.
    - **Must-not-change guardrails:**
      - Do not rewrite sync worker/outbox/API behavior.
      - Do not add a replacement manual sync button in another Account subsection.
      - Do not fake sync success/error states for this Account settings cell.
  - **Preconditions:** Authenticated user on Account tab.
  - **Start state:** Account Settings route is loaded.
  - **Transient states:** Not applicable; no manual sync request starts.
  - **Terminal states:** Success = no Sync Now action is present and Account sections remain usable; Error = Sync Now remains visible/reachable or Account load starts manual sync.
  - **Screenshot evidence:**
    - `SET-019-start-sync-now-action-removed`
    - `SET-019-terminal-sync-now-action-removed`
  - **Assertions/evidence:**
    - Absence of `Sync Now` button/action.
    - Presence of authenticated profile/account details.
  - **Automation notes:** Use deterministic authenticated settings fixtures, attach Account screenshots, and keep sync service/backend untouched.
- [ ] **SET-020 — Sync opt-in copy removed**
  - **Scope:** Account settings copy canonicalization for automatic signed-in sync.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** Account Settings does not present sync as a user opt-in feature; signed-in users get automatic sync behavior and signed-out users remain local-only.
  - **Interaction coverage:**
    - **Controls/actions:** Open Account Settings and verify former opt-in/manual sync explanatory copy is absent.
    - **Platform paths:**
      - All required Settings platforms use the Account tab copy.
      - Mobile/native platforms validate copy absence in narrow/touch/webview layout.
    - **Micro-states:**
      - Account page is stable for an authenticated user.
      - Former opt-in copy is absent.
      - Cloud Storage copy remains visible and storage-specific.
      - Profile and Danger Zone remain visible.
    - **Post-state effects:**
      - User-facing Account copy no longer implies sync can be manually enabled/disabled.
      - Cloud Storage copy remains scoped to stored book bytes/quota, not sync enablement.
      - Account Settings does not mutate sync state while verifying copy.
    - **Intersections:**
      - Signed-in automatic sync product model.
      - Signed-out local-only product model.
      - Cloud Storage quota copy.
      - Desktop/mobile/native Account layouts.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Account Settings route and translation resources are current.
      - Cloud Storage section owns storage quota copy.
    - **Direct effects:**
      - Former opt-in/manual sync copy is removed from Account settings.
    - **Downstream effects:**
      - Product contract no longer conflicts with automatic sync architecture.
      - QA, support, and docs should not instruct users to enable sync from Account settings.
      - Storage plan/quota copy remains user-facing as Cloud Storage.
    - **Platform guardrails:**
      - No stale locale-only or native/Tauri QA copy should reintroduce opt-in sync language.
      - Mobile/native screenshots must not show stale copy due to cached translations.
    - **Must-not-change guardrails:**
      - Do not remove legitimate technical/internal sync references from sync engine/tests/docs outside this Account copy contract.
      - Do not change import/load, backend sync, or storage semantics.
      - Do not rename storage quota semantics beyond visible misleading Cloud Sync Storage/Space copy.
  - **Preconditions:** Authenticated user on Account tab.
  - **Start state:** Account Settings route is loaded.
  - **Transient states:** Not applicable; copy should not flash old opt-in text.
  - **Terminal states:** Success = former sync opt-in/manual copy is absent and Cloud Storage/Profile/Danger Zone remain visible; Error = stale opt-in copy remains visible or storage copy implies manual sync enablement.
  - **Screenshot evidence:**
    - `SET-020-start-sync-opt-in-copy-removed`
    - `SET-020-terminal-sync-opt-in-copy-removed`
  - **Assertions/evidence:**
    - Absence of `Sign in to enable sync`, `Sync your books and reading progress to the cloud`, and `Keep your library synced across devices`.
    - Presence of Edit Profile/Account baseline controls and Cloud Storage copy.
  - **Automation notes:** Use deterministic authenticated settings fixtures, attach Account screenshots, and pair with search proof for stale user-facing strings.
- [ ] **SET-021 — Danger Zone sign out**
  - **Scope:** Account identity/session and destructive/reset blast-radius.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User signs out from Account Settings and confirms the active session is cleared and navigation lands in a safe signed-out state.
  - **Interaction coverage:**
    - **Controls/actions:** Click Sign Out in the Danger Zone and observe logout/navigation.
    - **Platform paths:**
      - All required Settings platforms use the Account tab Danger Zone Sign Out button.
      - Mobile/native platforms validate touch target visibility and post-logout navigation/back behavior.
    - **Micro-states:**
      - Authenticated session is active and Danger Zone is visible.
      - Sign Out action is activated.
      - Auth logout runs.
      - `keepLogin` is saved false.
      - Navigation moves to the safe library/auth state.
    - **Post-state effects:**
      - Auth session/token is cleared.
      - User is no longer able to view Settings content without auth.
      - `keepLogin` is false.
      - No account deletion is triggered.
    - **Intersections:**
      - Sign out from Account Settings.
      - Sign out with sync preference previously enabled.
      - Mobile/native post-logout back/menu behavior.
      - Re-entering Settings after sign-out routes through auth guard.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - DangerZone renders for authenticated user.
      - `useUserActions.handleLogout` calls auth logout and saves `keepLogin` false.
      - Navigation helper sends the user to a safe route.
    - **Direct effects:**
      - Active session is ended on this device.
    - **Downstream effects:**
      - SET-006 signed-out protection should apply after logout.
      - Sync preference/session persistence expectations reset to signed-out state.
      - Account/Profile/API/Billing Settings flows require fresh auth before continuing.
    - **Platform guardrails:**
      - Mobile/native back navigation must not reveal stale authenticated Settings content.
      - Tauri/native local session state must clear consistently with web auth state.
    - **Must-not-change guardrails:**
      - Sign out must not delete account data.
      - Sign out must not revoke API keys or remove BYOK keys.
      - Sign out must not mutate billing/storage quota.
      - Sign out must not leave protected Settings cards visible.
  - **Preconditions:** Authenticated user on Account tab.
  - **Start state:** Session is active and Danger Zone is visible.
  - **Transient states:** Sign Out action runs app logout and navigation.
  - **Terminal states:** Success = session clears and user lands on safe route/auth state; Cancel = user avoids action and remains signed in; Error = partial sign-out or stale authenticated UI.
  - **Screenshot evidence:**
    - `SET-021-start-danger-zone-sign-out`
    - Optional: `SET-021-transient-danger-zone-sign-out if observable`
    - `SET-021-terminal-danger-zone-sign-out`
  - **Assertions/evidence:**
    - Final route, session/auth state, and local sync/keepLogin note.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-022 — Delete Account cancel**
  - **Scope:** Account identity/session and destructive/reset blast-radius.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User opens the Delete Account confirmation and cancels, confirming the account remains intact.
  - **Interaction coverage:**
    - **Controls/actions:** Click Delete Account, review confirmation, then click Cancel or dismiss without confirming.
    - **Platform paths:**
      - All required Settings platforms use the Account tab Danger Zone Delete Account button and alert dialog.
      - Mobile/native platforms validate destructive dialog fit, warning copy visibility, and safe dismissal.
    - **Micro-states:**
      - Danger Zone is visible with Delete Account control.
      - Confirmation dialog opens.
      - Irreversible-action copy and app-store subscription warning are visible.
      - Cancel/dismiss is activated.
      - Dialog closes and Account Settings remains usable.
    - **Post-state effects:**
      - Account remains active and authenticated.
      - No delete request is sent on cancel.
      - User can continue using Settings.
      - Destructive confirm path remains untriggered.
    - **Intersections:**
      - Non-disposable account safe cancel.
      - Disposable account safe cancel before destructive success test.
      - Dialog cancel by button, close/back, or escape where supported.
      - Mobile/native destructive dialog dismissal.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - DangerZone Delete Account opens AlertDialog.
      - Cancel control can close the dialog without invoking delete.
      - Auth/session state can be verified after dismissal.
    - **Direct effects:**
      - User can inspect and abandon the destructive account-deletion flow.
    - **Downstream effects:**
      - Preserves account fixture for SET-023 and SET-024.
      - Confirms delete warning copy before any disposable destructive run.
      - Establishes cancel safety for destructive/reset blast-radius validation.
    - **Platform guardrails:**
      - Alert dialog actions must remain reachable on mobile/native safe areas.
      - Back/escape behavior must not accidentally confirm deletion.
    - **Must-not-change guardrails:**
      - Cancel must not delete the account.
      - Cancel must not sign the user out.
      - Cancel must not mutate books, progress, storage, billing, API keys, BYOK keys, or preferences.
      - Cancel must not leave a stale destructive loading state.
  - **Preconditions:** Authenticated disposable or non-disposable user; do not confirm destructive action.
  - **Start state:** Danger Zone is visible and account is intact.
  - **Transient states:** Delete Account confirmation dialog opens.
  - **Terminal states:** Success = not applicable; Cancel = dialog closes and account remains usable; Error = dialog cancel triggers mutation or stale warning state.
  - **Screenshot evidence:**
    - `SET-022-start-delete-account-cancel`
    - Optional: `SET-022-transient-delete-account-cancel if observable`
    - `SET-022-terminal-delete-account-cancel`
  - **Assertions/evidence:**
    - Confirmation copy, canceled state, and continued account access.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-023 — Delete Account success**
  - **Scope:** Account identity/session and destructive/reset blast-radius.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User confirms account deletion on a disposable account and verifies the account/session terminal state is clear.
  - **Interaction coverage:**
    - **Controls/actions:** On a disposable account, open Delete Account confirmation and confirm deletion.
    - **Platform paths:**
      - All required Settings platforms use the Account tab Danger Zone delete confirmation.
      - Mobile/native platforms validate destructive confirm visibility, deleting state, and post-delete navigation/back behavior.
    - **Micro-states:**
      - Delete confirmation dialog is open.
      - Subscription/app-store warning is visible.
      - Confirm Delete Account is activated.
      - Button enters Deleting state.
      - Delete request succeeds and logout/navigation follows.
    - **Post-state effects:**
      - Disposable account/session reaches deleted or signed-out terminal state.
      - Protected Settings content is no longer accessible for that session.
      - Post-delete route/auth state is clear and safe.
      - App-store subscription warning remains captured as user-facing caveat.
    - **Intersections:**
      - Disposable test account only.
      - Active subscription warning copy.
      - Successful delete plus logout.
      - Re-entry to Settings after deletion blocked by auth/session state.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Disposable account fixture is safe to destroy.
      - Delete user API/helper succeeds.
      - Logout/navigation path can run after deletion.
    - **Direct effects:**
      - Account deletion is confirmed and session is cleared for the disposable account.
    - **Downstream effects:**
      - Removes access to account-owned Settings data for the deleted account.
      - Validates the destructive path used by account lifecycle QA.
      - Confirms app-store subscription cancellation remains an external user responsibility.
    - **Platform guardrails:**
      - Mobile/native post-delete back navigation must not expose stale authenticated Settings.
      - Tauri/native local state must not retain deleted-account session data.
    - **Must-not-change guardrails:**
      - This scenario must never run on a non-disposable account.
      - Delete success must not leave API keys/BYOK/session usable for fresh auth as the deleted account.
      - Delete success must not report success while protected Settings remains accessible.
      - Delete success must not affect other users' data.
  - **Preconditions:** Disposable account only; subscription warning acknowledged.
  - **Start state:** Delete confirmation dialog is open for the disposable account.
  - **Transient states:** Confirm submits destructive deletion and app/session transitions.
  - **Terminal states:** Success = account deletion/session terminal state is clear; Cancel = not applicable after confirm; Error = failure copy appears and account state remains clear.
  - **Screenshot evidence:**
    - `SET-023-start-delete-account-success`
    - Optional: `SET-023-transient-delete-account-success if observable`
    - `SET-023-terminal-delete-account-success`
  - **Assertions/evidence:**
    - Disposable account deletion result, final route/session, and subscription-warning copy.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-024 — Delete Account failure**
  - **Scope:** Account identity/session and destructive/reset blast-radius.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User attempts account deletion with a forced failure and confirms the account remains intact with visible error feedback.
  - **Interaction coverage:**
    - **Controls/actions:** Confirm Delete Account under a forced delete failure and verify recovery/account preservation.
    - **Platform paths:**
      - All required Settings platforms use the Account tab Danger Zone delete confirmation.
      - Mobile/native platforms validate deleting state, failure toast/copy, dialog dismissal behavior, and continued account access.
    - **Micro-states:**
      - Delete confirmation dialog is open.
      - Confirm action enters Deleting state.
      - Delete request fails.
      - Error toast/copy appears.
      - Dialog may close as a known caveat.
      - Account/Settings access is re-verified after failure.
    - **Post-state effects:**
      - Account remains intact and authenticated.
      - Protected Settings content remains accessible after failure.
      - Failure is visible and not misreported as success.
      - User can retry or navigate safely.
    - **Intersections:**
      - Forced delete API failure.
      - Dialog closes after failure caveat.
      - Account preservation after destructive failure.
      - Mobile/native recovery and back/menu behavior.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Delete API/helper can be forced to fail.
      - Error toast/event dispatcher surfaces failure.
      - Auth/session state can be verified after failure.
    - **Direct effects:**
      - User sees deletion failure while account remains usable.
    - **Downstream effects:**
      - Protects account lifecycle tests from accepting partial deletion.
      - Confirms failure handling does not corrupt Profile/Storage/Sync/Danger Zone state.
      - Documents the dialog-close caveat so agents verify preserved state after dismissal.
    - **Platform guardrails:**
      - Mobile/native failure feedback must be visible even if the dialog closes.
      - Back/menu after failure must not expose a false signed-out/deleted state.
    - **Must-not-change guardrails:**
      - Failure must not delete the account.
      - Failure must not sign the user out.
      - Failure must not revoke API keys, remove BYOK keys, cancel billing, or clear preferences.
      - Failure must not leave destructive loading state stuck.
  - **Preconditions:** Disposable/failure fixture with delete API failure.
  - **Start state:** Delete confirmation dialog is open.
  - **Transient states:** Confirm submits and request fails.
  - **Terminal states:** Success = not applicable for failure fixture; Cancel = user can dismiss safely; Error = visible failure state and account remains intact.
  - **Screenshot evidence:**
    - `SET-024-start-delete-account-failure`
    - Optional: `SET-024-transient-delete-account-failure if observable`
    - `SET-024-terminal-delete-account-failure`
  - **Assertions/evidence:**
    - Failure copy/log, dialog/open-close behavior, and account still accessible.
    - Known failure-path caveat: a Delete Account failure can close the dialog, so the preserved account/session state must be verified after dismissal.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.

### Account/book-delete/persistence contract extension — PR-1 R1–R5 red-baseline scope

These scenarios cover the approved PR-1 surface: account A/B isolation, book-delete propagation, durable delete persistence, and platform/pre-namespace parity. `AUTH-001`, `AUTH-002`, and `AUTH-003` remain prerequisites for authenticated bootstrap, signed-out protection, and session refresh; this section validates what happens after authenticated account context exists.

PR-1 is contract, harness, and evidence only. Red outcomes are current-state or environment-blocked proof and must not be converted into product fixes in this PR.

- [ ] **ACCT-001 — Account A/B switch isolates library ownership**
  - **Scope:** R1 account lifecycle isolation.
  - **Platforms:**
    - `web-chromium`: Required
    - `web-webkit`: Required
    - `web-edge`: Required
    - `mobile-web-ios`: Required
    - `mobile-web-android`: Required
    - `mobile-web-ipados`: Required
    - `tauri-macos`: Required
    - `tauri-windows`: Required
    - `native-ios`: Required
    - `native-ipados`: Required
    - `native-android`: Required
  - **Scenario overview:** User signs in as account A, observes A-owned library artifacts, switches to account B, and confirms B never sees A-owned books, reader state, collections, sync status, or paint-cache artifacts.
  - **Interaction coverage:** Authenticate account A and account B through the canonical auth bootstrap; navigate Library/Home/Reader-adjacent surfaces through UI only; do not use localStorage or IndexedDB as pass/fail proof after auth bootstrap.
  - **Impact coverage:** Protects library rendering, paint cache, reader links, collections, sync ownership, AI/book context, and sidebar state from cross-account leakage.
  - **Preconditions:** `AUTH-001/002/003` satisfied; two QA accounts exist with distinct sentinel books or collections.
  - **Start state:** Account A is authenticated and A sentinel library state is visible.
  - **Transient states:** User signs out or switches account context; account B authenticates and app state rehydrates.
  - **Terminal states:** Success = B sees only B-owned artifacts and A sentinels are absent; Error = A artifacts leak into B, stale paint cache appears, or B routes open A reader keys.
  - **Screenshot evidence:**
    - `ACCT-001-start-account-a-library-isolation`
    - `ACCT-001-terminal-account-b-library-isolation`
  - **Assertions/evidence:** Account labels, visible sentinel titles/collections, absence of A sentinels in B, sanitized console/network audit, and explicit account-fixture inventory.
  - **Automation notes:** PR-1 target `account-delete-persistence` provides the web Playwright baseline slot and reports `env-blocked` until A/B QA credentials and sentinels are configured.
- [ ] **ACCT-002 — Pending work remains owned by the original account across switch**
  - **Scope:** R1/R4 account lifecycle isolation and pending work ownership.
  - **Platforms:**
    - `web-chromium`: Required
    - `web-webkit`: Required
    - `web-edge`: Required
    - `mobile-web-ios`: Required
    - `mobile-web-android`: Required
    - `mobile-web-ipados`: Required
    - `tauri-macos`: Required
    - `tauri-windows`: Required
    - `native-ios`: Required
    - `native-ipados`: Required
    - `native-android`: Required
  - **Scenario overview:** Account A creates pending local work, switches to account B before sync completes, and the pending work remains attributed to A rather than draining under B.
  - **Interaction coverage:** Create or stage a book/config/note/delete mutation as A, switch to B, observe B state and sync/outbox audit without mutating storage as proof.
  - **Impact coverage:** Protects durable outbox ownership, sync mutation `userId`, transfer ownership, local persistence, and cross-account offline recovery.
  - **Preconditions:** A/B QA accounts, a deterministic pending-work fixture, and a way to observe sync/outbox ownership through canonical QA artifacts.
  - **Start state:** Account A has a known pending mutation or transfer.
  - **Transient states:** Account switch occurs while pending work is not yet acknowledged.
  - **Terminal states:** Success = B does not apply/drain A work and A work remains recoverable for A; Error = B drains A mutation, B sees A artifact, or A pending work is lost.
  - **Screenshot evidence:**
    - `ACCT-002-start-account-a-pending-work`
    - `ACCT-002-terminal-account-b-no-pending-work-leak`
  - **Assertions/evidence:** Pending-work owner, mutation/entity id, account switch proof, B absence proof, and A recovery note.
  - **Automation notes:** Follow-up green evidence requires live sync/outbox observability; PR-1 records the contract and harness slot.
- [ ] **ACCT-003 — Returning to account A restores A state without B leakage**
  - **Scope:** R1/R4 account lifecycle return integrity.
  - **Platforms:**
    - `web-chromium`: Required
    - `web-webkit`: Required
    - `web-edge`: Required
    - `mobile-web-ios`: Required
    - `mobile-web-android`: Required
    - `mobile-web-ipados`: Required
    - `tauri-macos`: Required
    - `tauri-windows`: Required
    - `native-ios`: Required
    - `native-ipados`: Required
    - `native-android`: Required
  - **Scenario overview:** After A → B → A switching, account A's expected books, delete tombstones, reader state, collections, and pending work return intact while B artifacts remain absent.
  - **Interaction coverage:** Run the full account switch loop through auth/session UI or canonical bootstrap; verify route, Library, Home, and reader-entry state by UI and sanitized artifacts.
  - **Impact coverage:** Detects stale account namespace cleanup, paint-cache owner mismatch, persisted sidebar/collection leaks, and lost pending A work.
  - **Preconditions:** ACCT-001 and ACCT-002 setup exists.
  - **Start state:** Account B is authenticated after having visited A first.
  - **Transient states:** User switches back to account A and app state rehydrates.
  - **Terminal states:** Success = A state matches its pre-switch baseline and B state is absent; Error = B artifacts leak into A or A state is lost/resurrected incorrectly.
  - **Screenshot evidence:**
    - `ACCT-003-start-account-b-before-return`
    - `ACCT-003-terminal-account-a-return-integrity`
  - **Assertions/evidence:** A before/after state diff, B absence proof, and pending-work recovery status.
  - **Automation notes:** PR-1 target includes this as part of the A/B isolation follow-up matrix.
- [ ] **ACCT-004 — Account-owned caches and artifacts are explicitly namespaced**
  - **Scope:** R1/R5 account lifecycle and pre-namespace migration.
  - **Platforms:**
    - `web-chromium`: Required
    - `web-webkit`: Required
    - `web-edge`: Required
    - `mobile-web-ios`: Required
    - `mobile-web-android`: Required
    - `mobile-web-ipados`: Required
    - `tauri-macos`: Required
    - `tauri-windows`: Required
    - `native-ios`: Required
    - `native-ipados`: Required
    - `native-android`: Required
  - **Scenario overview:** Account-owned paint caches, library persistence, collections, reader keys, and sync cursors are either user-namespaced or safely ignored/migrated when the owner account changes.
  - **Interaction coverage:** Inspect account switch surfaces and canonical artifacts for owner labels; verify legacy pre-namespace data does not render as another account's active state.
  - **Impact coverage:** Covers existing `libraryOwnerUserId`, collection owner state, reader/session keys, local files, and migration behavior before broader namespace migrations.
  - **Preconditions:** A/B accounts and at least one pre-namespace or owner-mismatch fixture.
  - **Start state:** Owner-mismatch or pre-namespace local artifact exists.
  - **Transient states:** App starts or switches account and evaluates owner metadata.
  - **Terminal states:** Success = mismatched artifacts are hidden, migrated, or explicitly quarantined; Error = mismatched artifacts render as current-account data.
  - **Screenshot evidence:**
    - `ACCT-004-start-pre-namespace-artifact`
    - `ACCT-004-terminal-owner-mismatch-quarantined`
  - **Assertions/evidence:** Owner metadata, visible UI absence, and migration/quarantine note.
  - **Automation notes:** PR-1 documents the parity/migration contract; implementation lanes may add fixture seeding later.
- [ ] **DEL-001 — Book delete writes server-authoritative `books.deleted_at`**
  - **Scope:** R2 book delete server state.
  - **Platforms:**
    - `web-chromium`: Required
    - `web-webkit`: Required
    - `web-edge`: Required
    - `mobile-web-ios`: Required
    - `mobile-web-android`: Required
    - `mobile-web-ipados`: Required
    - `tauri-macos`: Required
    - `tauri-windows`: Required
    - `native-ios`: Required
    - `native-ipados`: Required
    - `native-android`: Required
  - **Scenario overview:** User deletes a seeded book and the canonical backend row for that user's `books` record receives `deleted_at`, with the book removed from visible library surfaces.
  - **Interaction coverage:** Delete through product UI or canonical sync mutation path; verify server state with SQL/API evidence; do not mark green from client-only disappearance.
  - **Impact coverage:** Protects library quotas, Home/Library filters, sync reconciliation, catalog import rows, and reader route availability.
  - **Preconditions:** Dedicated disposable book fixture, live auth, and server verification access.
  - **Start state:** Disposable book is visible in the deleting account's library and has an active backend `books` row.
  - **Transient states:** Delete confirmation/mutation is submitted and sync drain or server route processes it.
  - **Terminal states:** Success = `books.deleted_at` is set for the correct user/book and visible surfaces hide the book; Error = client-only delete, wrong user row, or missing tombstone.
  - **Screenshot evidence:**
    - `DEL-001-start-book-visible-before-delete`
    - `DEL-001-terminal-book-hidden-after-server-tombstone`
  - **Assertions/evidence:** Before/after UI, request/mutation id, SQL/API `deleted_at` proof, and user/book identity.
  - **Automation notes:** PR-1 target provides a baseline slot and reports env-blocked until disposable book + verification env exists.
- [ ] **DEL-002 — Book delete removes owned R2/file storage object when applicable**
  - **Scope:** R2/storage cleanup and quota integrity.
  - **Platforms:**
    - `web-chromium`: Required
    - `web-webkit`: Required
    - `web-edge`: Required
    - `mobile-web-ios`: Required
    - `mobile-web-android`: Required
    - `mobile-web-ipados`: Required
    - `tauri-macos`: Required
    - `tauri-windows`: Required
    - `native-ios`: Required
    - `native-ipados`: Required
    - `native-android`: Required
  - **Scenario overview:** Deleting a user-uploaded/cloud-stored book removes or tombstones the corresponding owned file/storage object and reconciles quota without deleting another user's object.
  - **Interaction coverage:** Capture pre-delete storage key, run delete, verify storage absence/tombstone and quota state with redacted proof.
  - **Impact coverage:** Covers R2 object lifecycle, files rows, storage quota, transfer delete queue, and cross-user storage ownership.
  - **Preconditions:** Disposable uploaded book with known storage key and storage verification access.
  - **Start state:** User-owned book object exists and is linked to the active book row.
  - **Transient states:** Delete operation triggers file/object cleanup or canonical tombstone lifecycle.
  - **Terminal states:** Success = owned object is absent/tombstoned and quota reconciles; Error = object leak, wrong-user delete, signed URL leakage, or quota drift.
  - **Screenshot evidence:**
    - `DEL-002-start-book-storage-object-present`
    - `DEL-002-terminal-book-storage-object-removed`
  - **Assertions/evidence:** Redacted object key prefix, file row state, quota delta, and no signed URLs or secrets in evidence.
  - **Automation notes:** PR-1 records this as a red/env-blocked slot until storage verification credentials are available.
- [ ] **DEL-003 — Book delete propagates across devices/accounts without resurrection**
  - **Scope:** R3 cross-device sync propagation.
  - **Platforms:**
    - `web-chromium`: Required
    - `web-webkit`: Required
    - `web-edge`: Required
    - `mobile-web-ios`: Required
    - `mobile-web-android`: Required
    - `mobile-web-ipados`: Required
    - `tauri-macos`: Required
    - `tauri-windows`: Required
    - `native-ios`: Required
    - `native-ipados`: Required
    - `native-android`: Required
  - **Scenario overview:** Account A deletes a book on device/session 1, device/session 2 for account A receives the tombstone and hides the book, while account B remains isolated.
  - **Interaction coverage:** Use two live sessions for account A and one control account B; run delete in A1, sync/reconcile A2, and verify B is unaffected.
  - **Impact coverage:** Protects sync pull, remote tombstone apply, library paint cache, reader route invalidation, and cross-account isolation.
  - **Preconditions:** A/B accounts, two A sessions/devices, seeded disposable book.
  - **Start state:** Book is visible on A1 and A2; B has distinct control state.
  - **Transient states:** A1 deletes; backend emits tombstone; A2 syncs/reconciles.
  - **Terminal states:** Success = A2 hides the book and B remains unchanged; Error = A2 resurrects the book, misses tombstone, or B changes.
  - **Screenshot evidence:**
    - `DEL-003-start-book-visible-on-device-two`
    - `DEL-003-terminal-delete-propagated-no-resurrection`
  - **Assertions/evidence:** A1/A2/B visible state, tombstone revision, sync run status, and absence of resurrection.
  - **Automation notes:** Follow-up green evidence requires multi-context/device orchestration through the same QA target.
- [ ] **DEL-004 — Offline book delete survives reload, logout, and account switch**
  - **Scope:** R4 durable offline outbox delete.
  - **Platforms:**
    - `web-chromium`: Required
    - `web-webkit`: Required
    - `web-edge`: Required
    - `mobile-web-ios`: Required
    - `mobile-web-android`: Required
    - `mobile-web-ipados`: Required
    - `tauri-macos`: Required
    - `tauri-windows`: Required
    - `native-ios`: Required
    - `native-ipados`: Required
    - `native-android`: Required
  - **Scenario overview:** Account A deletes a book while offline, reloads/logs out/switches accounts, and when A returns online the delete drains under A and does not leak to B.
  - **Interaction coverage:** Enter offline mode, delete seeded book, reload/reopen or switch account, restore online under A, and verify durable outbox/server tombstone.
  - **Impact coverage:** Covers IndexedDB/durable outbox, local tombstones, auth ownership, sync worker recovery, and mobile lifecycle persistence.
  - **Preconditions:** Offline-control harness, A/B accounts, disposable book, and server verification.
  - **Start state:** A is offline with a visible disposable book.
  - **Transient states:** Delete is enqueued offline; page reload/logout/switch occurs; online state returns.
  - **Terminal states:** Success = A delete drains and B never sees or drains A mutation; Error = pending delete lost, wrong owner, or book resurrected.
  - **Screenshot evidence:**
    - `DEL-004-start-offline-delete-enqueued`
    - `DEL-004-terminal-offline-delete-drained-under-account-a`
  - **Assertions/evidence:** Outbox owner, mutation id, post-reload/switch survival, server tombstone, and B absence proof.
  - **Automation notes:** PR-1 records the slot; green evidence needs live offline and outbox observability.
- [ ] **DEL-005 — Legacy/pre-namespace book keys delete safely without resurrection**
  - **Scope:** R5 legacy-key deletion and migration safety.
  - **Platforms:**
    - `web-chromium`: Required
    - `web-webkit`: Required
    - `web-edge`: Required
    - `mobile-web-ios`: Required
    - `mobile-web-android`: Required
    - `mobile-web-ipados`: Required
    - `tauri-macos`: Required
    - `tauri-windows`: Required
    - `native-ios`: Required
    - `native-ipados`: Required
    - `native-android`: Required
  - **Scenario overview:** A legacy or pre-namespace book identity/key can be deleted once, mapped to the correct canonical book row/object, and cannot reappear from old local or remote state.
  - **Interaction coverage:** Seed legacy-key fixture, delete through product path, run reload/sync/reimport-adjacent checks, and verify no stale key resurrection.
  - **Impact coverage:** Covers reader session keys, local 32-char hashes, platform hashes, catalog refs, metaHash grouping, sync entity ids, and migration compatibility.
  - **Preconditions:** Legacy/pre-namespace fixture and identity mapping proof.
  - **Start state:** Legacy-key book fixture is visible and mapped to a canonical backend row.
  - **Transient states:** Delete normalizes identity and writes tombstone/cleanup.
  - **Terminal states:** Success = correct row/object is deleted and stale legacy key cannot resurrect; Error = wrong identity deleted, duplicate row remains, or legacy state reappears.
  - **Screenshot evidence:**
    - `DEL-005-start-legacy-key-book-visible`
    - `DEL-005-terminal-legacy-key-delete-no-resurrection`
  - **Assertions/evidence:** Legacy key, canonical identity mapping, tombstone/storage proof, and reload/sync no-resurrection proof.
  - **Automation notes:** Coordinate with canonical book identity migration work; PR-1 is contract/harness only.
- [ ] **DEL-006 — Soft-deleted books never reappear on passive sync or account switch**
  - **Scope:** R3/R5 no-resurrection guardrail.
  - **Platforms:**
    - `web-chromium`: Required
    - `web-webkit`: Required
    - `web-edge`: Required
    - `mobile-web-ios`: Required
    - `mobile-web-android`: Required
    - `mobile-web-ipados`: Required
    - `tauri-macos`: Required
    - `tauri-windows`: Required
    - `native-ios`: Required
    - `native-ipados`: Required
    - `native-android`: Required
  - **Scenario overview:** A book with `deleted_at` set remains hidden through passive sync, app reload, account switch, and return-to-account flows unless an explicit supported reimport action is performed.
  - **Interaction coverage:** Start with a soft-deleted row/tombstone fixture, run passive app startup/sync/account-switch flows, and verify absence across Home/Library/Reader entry points.
  - **Impact coverage:** Protects Home sections, Library filters, sync reconcile, catalog import edge cases, and reader deep links from resurrecting deleted books.
  - **Preconditions:** Soft-deleted fixture and expected explicit reimport behavior documented separately.
  - **Start state:** Soft-deleted book tombstone exists for account A.
  - **Transient states:** App starts, sync runs, account switches A↔B↔A.
  - **Terminal states:** Success = deleted book remains absent; Error = passive sync or account switch makes the book visible again.
  - **Screenshot evidence:**
    - `DEL-006-start-soft-deleted-tombstone`
    - `DEL-006-terminal-no-soft-delete-resurrection`
  - **Assertions/evidence:** Tombstone revision, visible absence, sync run, and account switch proof.
  - **Automation notes:** Existing catalog explicit reimport remains separate; this scenario covers passive resurrection only.
- [ ] **PAR-001 — Book-delete/account-isolation contracts run through the canonical platform matrix**
  - **Scope:** R5 platform parity.
  - **Platforms:**
    - `web-chromium`: Required
    - `web-webkit`: Required
    - `web-edge`: Required
    - `mobile-web-ios`: Required
    - `mobile-web-android`: Required
    - `mobile-web-ipados`: Required
    - `tauri-macos`: Required
    - `tauri-windows`: Required
    - `native-ios`: Required
    - `native-ipados`: Required
    - `native-android`: Required
  - **Scenario overview:** The same ACCT/DEL contracts are executable through `apps/openread-app/e2e/qa` targets and platform registries rather than standalone scripts or manually curated screenshots.
  - **Interaction coverage:** Run the `account-delete-persistence` target on web first, then promote to Playwright and native/Tauri matrices as platform harnesses are available.
  - **Impact coverage:** Keeps evidence canonical across browser, mobile-web, desktop Tauri, and native mobile surfaces.
  - **Preconditions:** QA target registry exists and platform adapters are registered.
  - **Start state:** Feature target is discoverable by `node e2e/qa/cli.mjs targets`.
  - **Transient states:** Platform run creates expected-current report and screenshot/artifact slots.
  - **Terminal states:** Success = canonical target produces platform evidence; Error = standalone runner, latest-file-wins screenshots, or noncanonical publisher.
  - **Screenshot evidence:**
    - `PAR-001-start-canonical-platform-target`
    - `PAR-001-terminal-canonical-platform-target`
  - **Assertions/evidence:** Target registry, matrix compatibility, expected-current report, and Notion/evidence-page compatibility.
  - **Automation notes:** PR-1 implements target registration and web baseline slots.
- [ ] **PAR-002 — Pre-namespace migration has explicit setup/reset evidence**
  - **Scope:** R5 migration and QA reset integrity.
  - **Platforms:**
    - `web-chromium`: Required
    - `web-webkit`: Required
    - `web-edge`: Required
    - `mobile-web-ios`: Required
    - `mobile-web-android`: Required
    - `mobile-web-ipados`: Required
    - `tauri-macos`: Required
    - `tauri-windows`: Required
    - `native-ios`: Required
    - `native-ipados`: Required
    - `native-android`: Required
  - **Scenario overview:** Any legacy/pre-namespace fixture used by ACCT/DEL tests records setup inventory and cleanup/reset state explicitly; hidden `afterEach` cleanup and manually curated proof are not accepted.
  - **Interaction coverage:** Attach setup/reset artifacts before and after runs, including account ids, book identities, storage keys, outbox status, and cleanup result.
  - **Impact coverage:** Prevents test state leaks, misleading green evidence, secret exposure, and cross-account contamination during migration validation.
  - **Preconditions:** Canonical QA activity/attempt id and fixture inventory.
  - **Start state:** Fixture inventory is attached before mutation.
  - **Transient states:** Contract run mutates/delete/switches state.
  - **Terminal states:** Success = reset is visible and complete or residue is explicitly reported; Error = hidden cleanup, missing inventory, or untracked residue.
  - **Screenshot evidence:**
    - `PAR-002-start-pre-namespace-fixture-inventory`
    - `PAR-002-terminal-pre-namespace-reset-outcome`
  - **Assertions/evidence:** Setup/reset artifact, env classification, account/book/storage identifiers with secrets redacted, and no hidden cleanup.
  - **Automation notes:** PR-1 target attaches env-blocked fixture requirements; destructive reset implementation follows after QA env provisioning.

#### Account/book-delete/persistence assertion appendix

- **SQL residual/tombstone checks (run with service-role access in a controlled QA environment only):**

  ```sql
  -- Replace :user_id and :book_hash with the account/book fixture recorded in evidence.
  select id, user_id, book_hash, deleted_at, updated_at, storage_path
  from books
  where user_id = :user_id and book_hash = :book_hash;

  select id, user_id, book_hash, status, deleted_at, file_key
  from files
  where user_id = :user_id and book_hash = :book_hash;
  ```

- **Storage/R2 guidance:** deletion proof must record the pre-delete user-owned object key prefix and post-delete absence/tombstone check. Published evidence must redact signed URLs, tokens, object bodies, and private keys.
- **Console/network denylist:** fail or mark red if evidence contains auth tokens, refresh tokens, signed R2 URLs, service-role keys, stack traces with secrets, browser-route mocked delete/sync proof, manually edited localStorage/IndexedDB after auth bootstrap, or hidden cleanup/reset.
- **Follow-up implementation matrix:**
  - R1 / ACCT-001..004: provision two QA accounts with distinct sentinels; add account-switch run proof across web and mobile-web first.
  - R2 / DEL-001..002: provision disposable uploaded book fixtures, SQL verification, and R2/storage audit.
  - R3 / DEL-003 and DEL-006: add two-session/cross-device tombstone propagation and no-resurrection proof.
  - R4 / ACCT-002 and DEL-004: add offline/outbox ownership and logout/switch survival proof.
  - R5 / DEL-005 and PAR-001..002: add legacy/pre-namespace fixtures, canonical platform matrix promotion, and explicit setup/reset artifacts.

- [ ] **SET-025 — Theme mode persistence**
  - **Scope:** Device-local app preferences.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User selects a theme mode and confirms the app appearance and stored preference persist after reload.
  - **Interaction coverage:**
    - **Controls/actions:** Select Light, Dark, or System in the Appearance Theme Mode controls.
    - **Platform paths:**
      - All required Settings platforms use Preferences → Appearance → Theme Mode buttons.
      - Mobile/native platforms validate touch target layout and safe-area visibility of the mode grid.
    - **Micro-states:**
      - Current theme mode is visible before change.
      - User selects a different mode.
      - Selected mode gets active styling.
      - App shell/theme updates.
      - Reload/reopen rehydrates the selected mode.
    - **Post-state effects:**
      - Theme mode persists in theme store state.
      - App shell colors reflect the selected mode or system mode behavior.
      - Preferences tab remains usable after the visual change.
    - **Intersections:**
      - Light mode selection.
      - Dark mode selection.
      - System/auto mode selection.
      - Web local persistence and Tauri/native persisted theme state.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Theme store exposes themeMode and setThemeMode.
      - AppearanceSection renders all theme mode buttons.
      - App shell consumes theme mode for visual styling.
    - **Direct effects:**
      - User changes the application theme mode.
    - **Downstream effects:**
      - Affects visual baseline for all later Settings and Reader screenshots.
      - Confirms Reset Preferences can restore default theme mode in SET-044.
      - Provides guardrails for theme-color testing in SET-026.
    - **Platform guardrails:**
      - Mode active state must remain visible in mobile/native grid layouts.
      - Tauri/native shell chrome and safe areas must remain readable after theme change.
    - **Must-not-change guardrails:**
      - Theme mode change must not mutate account, storage, sync, billing, API keys, BYOK keys, or Reader content.
      - Theme mode change must not sign the user out.
      - Theme mode change must not reset theme color or unrelated preferences.
      - Theme mode change must not open dialogs or destructive flows.
  - **Preconditions:** Authenticated or local user on Preferences tab.
  - **Start state:** Appearance card shows current theme mode.
  - **Transient states:** User selects Light/Dark/System and app shell updates.
  - **Terminal states:** Success = selected mode persists after reload; Cancel = selecting prior mode restores previous appearance; Error = preview/app shell and stored value diverge.
  - **Screenshot evidence:**
    - `SET-025-start-theme-mode-persistence`
    - Optional: `SET-025-transient-theme-mode-persistence if observable`
    - `SET-025-terminal-theme-mode-persistence`
  - **Assertions/evidence:**
    - Before/after theme, stored setting, and reload capture.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-026 — Theme color persistence**
  - **Scope:** Device-local app preferences.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User selects a theme color and confirms the preview/app chrome and stored preference persist after reload.
  - **Interaction coverage:**
    - **Controls/actions:** Select a different Theme Color in the Appearance card.
    - **Platform paths:**
      - All required Settings platforms use Preferences → Appearance → Theme Color swatches/buttons.
      - Mobile/native platforms validate color grid wrapping and selected-ring visibility.
    - **Micro-states:**
      - Current theme color is visible before change.
      - User selects a different color.
      - Selected color gets active ring/selected styling.
      - App shell/theme accents update.
      - Reload/reopen rehydrates the selected color.
    - **Post-state effects:**
      - Theme color persists in theme store state.
      - UI accents match the chosen theme color.
      - Theme mode value remains unchanged unless separately changed.
    - **Intersections:**
      - Theme color change in light mode.
      - Theme color change in dark mode.
      - Color grid on mobile/narrow widths.
      - Web local persistence and Tauri/native persisted theme state.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Theme list and theme store expose available colors and setThemeColor.
      - AppearanceSection renders color buttons with active state.
      - App shell consumes theme color tokens.
    - **Direct effects:**
      - User changes the application theme color.
    - **Downstream effects:**
      - Affects visual baseline for later Settings screenshots and accessibility checks.
      - Confirms Reset Preferences can restore default color in SET-044.
      - Provides visual state to distinguish theme-mode and theme-color persistence.
    - **Platform guardrails:**
      - Color labels/active rings must remain visible on mobile/native grids.
      - Tauri/native shell chrome must remain readable after color change.
    - **Must-not-change guardrails:**
      - Theme color change must not mutate account, storage, sync, billing, API keys, BYOK keys, or Reader content.
      - Theme color change must not sign the user out.
      - Theme color change must not reset theme mode or unrelated preferences.
      - Theme color change must not open dialogs or destructive flows.
  - **Preconditions:** User on Preferences tab with Appearance card.
  - **Start state:** Theme color has a known starting value.
  - **Transient states:** User selects a different theme color and preview/app chrome updates.
  - **Terminal states:** Success = color persists after reload and applies consistently; Cancel = selecting prior color restores prior appearance; Error = mismatched preview/app color.
  - **Screenshot evidence:**
    - `SET-026-start-theme-color-persistence`
    - Optional: `SET-026-transient-theme-color-persistence if observable`
    - `SET-026-terminal-theme-color-persistence`
  - **Assertions/evidence:**
    - Before/after color capture and reload state.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-027 — Reading font default persistence**
  - **Scope:** Global Reader defaults.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User changes the default reading font and confirms the preview, stored setting, and newly opened Reader default agree.
  - **Interaction coverage:**
    - **Controls/actions:** Open the Default Font select and choose Serif or Sans-serif.
    - **Platform paths:**
      - All required Settings platforms use Preferences → Reading → Default Font select.
      - Mobile/native platforms validate select/popover behavior and preview readability.
    - **Micro-states:**
      - Current default font is visible.
      - Font select opens.
      - User chooses a different font family.
      - Preview text updates its font family.
      - Settings save persists globalViewSettings.defaultFont.
      - Reload/reopen rehydrates the selected value.
    - **Post-state effects:**
      - Reading default font persists in settings store/appService.
      - New Reader sessions use the selected default where no per-book override applies.
      - Existing unrelated settings remain unchanged.
    - **Intersections:**
      - Serif to Sans-serif change.
      - Sans-serif to Serif change.
      - Preview versus Reader default behavior.
      - Web and Tauri/native settings persistence.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - ReadingSection reads and saves `globalViewSettings.defaultFont`.
      - appService/envConfig persist system settings.
      - Reader default settings consume globalViewSettings for new sessions.
    - **Direct effects:**
      - User changes the global default Reader font family.
    - **Downstream effects:**
      - Affects Reader defaults and SET-061 through SET-067 reader-settings validation.
      - Provides data for Reset Preferences default restoration in SET-044.
      - Confirms Settings preview reflects the same stored default used downstream.
    - **Platform guardrails:**
      - Select popover must be usable on mobile/native and not clipped by safe areas.
      - Tauri/native persistence must survive reload/reopen.
    - **Must-not-change guardrails:**
      - Font default change must not mutate per-book overrides unless current product intentionally applies global defaults.
      - Font default change must not alter account, billing, sync, API keys, BYOK keys, or storage.
      - Font default change must not sign the user out.
      - Font default change must not reset size or line height.
  - **Preconditions:** User on Preferences tab with Reading card.
  - **Start state:** Reading defaults have known starting values.
  - **Transient states:** User changes default font family and preview updates.
  - **Terminal states:** Success = font persists and newly opened Reader uses expected default; Cancel = reverting restores prior default; Error = Settings value and Reader default diverge.
  - **Screenshot evidence:**
    - `SET-027-start-reading-font-default-persistence`
    - Optional: `SET-027-transient-reading-font-default-persistence if observable`
    - `SET-027-terminal-reading-font-default-persistence`
  - **Assertions/evidence:**
    - Reading card value, preview, Reader default, and reload state.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-028 — Reading size/line-height persistence**
  - **Scope:** Global Reader defaults.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User changes default reading font size and line height, then confirms preview, persistence, and Reader defaults agree.
  - **Interaction coverage:**
    - **Controls/actions:** Adjust Font Size and Line Height number inputs in the Reading card.
    - **Platform paths:**
      - All required Settings platforms use Preferences → Reading numeric controls.
      - Mobile/native platforms validate steppers/keyboard input and preview visibility.
    - **Micro-states:**
      - Starting font size and line-height values are recorded.
      - User increments/decrements or types valid values.
      - Preview text updates size and line height.
      - Settings save persists `defaultFontSize` and `lineHeight`.
      - Reload/reopen rehydrates the selected values.
    - **Post-state effects:**
      - Reading default size and line height persist in globalViewSettings.
      - New Reader sessions use the selected defaults where no per-book override applies.
      - Font family and unrelated preferences remain unchanged.
    - **Intersections:**
      - Minimum/maximum/normal font size values.
      - Minimum/maximum/normal line-height values.
      - Preview versus Reader default behavior.
      - Mobile numeric input/keyboard behavior.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - ReadingSection NumberInput controls update local state.
      - saveViewSetting persists `defaultFontSize` and `lineHeight`.
      - Reader defaults consume globalViewSettings.
    - **Direct effects:**
      - User changes global Reader sizing defaults.
    - **Downstream effects:**
      - Affects Reader default rendering and SET-061 through SET-067 validation.
      - Provides data for Reset Preferences default restoration in SET-044.
      - Confirms Settings preview aligns with saved Reader defaults.
    - **Platform guardrails:**
      - Numeric controls must remain usable with mobile/native keyboards.
      - Tauri/native persistence must survive reload/reopen.
      - Preview must remain readable and not overflow after large values.
    - **Must-not-change guardrails:**
      - Size/line-height changes must not mutate per-book overrides unless current product intentionally applies global defaults.
      - Size/line-height changes must not alter font family, theme, account, billing, sync, API keys, or BYOK keys.
      - Size/line-height changes must not sign the user out.
      - Invalid/out-of-range input must not corrupt stored settings.
  - **Preconditions:** User on Preferences tab with Reading card.
  - **Start state:** Font size and line height have known starting values.
  - **Transient states:** User adjusts size/line-height and preview updates.
  - **Terminal states:** Success = values persist and new Reader session reflects them; Cancel = revert restores prior values; Error = preview/Reader mismatch.
  - **Screenshot evidence:**
    - `SET-028-start-reading-size-line-height-persistence`
    - Optional: `SET-028-transient-reading-size-line-height-persistence if observable`
    - `SET-028-terminal-reading-size-line-height-persistence`
  - **Assertions/evidence:**
    - Before/after values, preview, Reader check, and reload state.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-029 — AI enable/disable**
  - **Scope:** Device-local app preferences and platform capability.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User toggles AI features on/off and confirms the persisted setting and dependent AI controls behave consistently.
  - **Interaction coverage:**
    - **Controls/actions:** Toggle Enable AI Features in the AI Settings card.
    - **Platform paths:**
      - All required Settings platforms use Preferences → AI Settings → Enable AI Features toggle.
      - Mobile/native platforms validate touch target, disabled-section opacity, and form accessibility.
    - **Micro-states:**
      - Current AI enabled value is recorded.
      - Toggle changes enabled state.
      - Dependent AI mode/BYOK sections become disabled or enabled.
      - Settings save persists aiSettings.enabled.
      - Reload/reopen rehydrates the selected value.
    - **Post-state effects:**
      - Disabled AI state prevents dependent controls from being usable.
      - Enabled AI state restores dependent controls according to plan/platform gates.
      - AI entry points should degrade/return consistently with the saved setting.
      - Existing provider/BYOK values are not erased merely by disabling AI.
    - **Intersections:**
      - Enabled to disabled transition.
      - Disabled to enabled transition.
      - BYOK gate with AI disabled/enabled.
      - Online/offline provider controls with AI disabled/enabled.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - AiSection reads/writes aiSettings.enabled.
      - useSettingsStore/appService persist AI settings.
      - Dependent AI controls honor disabledSection.
    - **Direct effects:**
      - User changes whether AI features are enabled.
    - **Downstream effects:**
      - Affects Reader/assistant AI entry-point availability and limit/usage behavior.
      - Gates Online/Offline and BYOK interaction scenarios that follow.
      - Provides data for Reset Preferences default restoration in SET-044.
    - **Platform guardrails:**
      - Disabled/enabled visual state must remain clear on mobile/native.
      - Tauri/native persistence must survive reload/reopen.
    - **Must-not-change guardrails:**
      - Disabling AI must not remove saved BYOK keys.
      - Toggling AI must not mutate profile, storage, sync, billing, API keys, or Reader content.
      - Toggling AI must not sign the user out.
      - Toggling AI must not bypass plan gates.
  - **Preconditions:** User on Preferences tab with AI Settings card.
  - **Start state:** AI enabled value is known.
  - **Transient states:** User toggles Enable AI Features.
  - **Terminal states:** Success = AI-enabled state persists and dependent AI entry points degrade/return as intended; Cancel = toggling back restores original; Error = toggle value and AI availability diverge.
  - **Screenshot evidence:**
    - `SET-029-start-ai-enable-disable`
    - Optional: `SET-029-transient-ai-enable-disable if observable`
    - `SET-029-terminal-ai-enable-disable`
  - **Assertions/evidence:**
    - Toggle state, reload state, and affected AI entry-point behavior.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-030 — AI Online/Offline mode switching**
  - **Scope:** Device-local app preferences and platform capability.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Not required
      - **Status:** Consistent
      - **Reason:** Offline Ollama mode is hidden on mobile web to match the mobile/native unsupported baseline.
    - `mobile-web-android`: Not required
      - **Status:** Consistent
      - **Reason:** Offline Ollama mode is hidden on mobile web to match the mobile/native unsupported baseline.
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** Offline Ollama mode is hidden or unsupported on this mobile/native baseline.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** Offline Ollama mode is hidden or unsupported on this mobile/native baseline.
  - **Scenario overview:** User switches AI mode between Online and Offline where supported and confirms provider persistence plus documented platform gating.
  - **Interaction coverage:**
    - **Controls/actions:** Select Online (Cloud) and Offline (Local) AI mode radio controls where the platform requires them.
    - **Platform paths:**
      - Desktop web and Tauri desktop use Preferences → AI Settings → Mode controls.
      - Mobile web is Not required and should hide/avoid Offline mode in the mobile baseline.
      - Native iOS/Android are Not required and should hide/avoid Offline mode in the mobile/native baseline.
    - **Micro-states:**
      - AI is enabled before switching modes.
      - Current provider/mode is visible.
      - User selects Online or Offline.
      - Provider setting persists as Groq/online or Ollama/offline.
      - Offline selection may trigger Ollama detection.
    - **Post-state effects:**
      - Selected mode remains saved after reload/reopen.
      - Online mode uses cloud provider path.
      - Offline mode uses local Ollama path where supported.
      - Unsupported mobile web/native paths are hidden.
    - **Intersections:**
      - Online to Offline transition.
      - Offline to Online transition.
      - Desktop supported Offline mode.
      - Mobile web hidden/unsupported Offline mode.
      - Native mobile hidden/unsupported Offline mode.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - AiSection reads/writes aiSettings.provider.
      - `isOfflineAiSupportedPlatform()` hides Offline visibility on native mobile and mobile-web environments.
      - Ollama detection is available when provider becomes `ollama`.
    - **Direct effects:**
      - User changes the AI provider/mode preference.
    - **Downstream effects:**
      - Determines whether Reader/assistant AI calls use cloud or local Ollama behavior.
      - Sets up SET-031 and SET-032 Ollama detection scenarios.
      - Confirms the resolved mobile-web gating behavior stays hidden.
    - **Platform guardrails:**
      - Desktop Offline controls must be visible and usable.
      - Native iOS/Android Offline controls should remain hidden/unsupported.
      - Mobile web Offline controls must remain hidden, not silently reappear.
    - **Must-not-change guardrails:**
      - Mode switching must not erase BYOK provider keys.
      - Mode switching must not mutate account, storage, sync, billing, API keys, or Reader content.
      - Mode switching must not sign the user out.
      - Unsupported modes must not be accepted silently without documentation.
  - **Preconditions:** Platform where mode switch is available; local user settings loaded.
  - **Start state:** AI Settings shows current mode/provider.
  - **Transient states:** User switches between Online and Offline where supported.
  - **Terminal states:** Success = selected mode/provider persists and unsupported mobile Offline mode is hidden; Cancel = switching back restores prior mode; Error = unsupported mode appears or provider state corrupts.
  - **Screenshot evidence:**
    - `SET-030-start-ai-online-offline-mode-switching`
    - Optional: `SET-030-transient-ai-online-offline-mode-switching if observable`
    - `SET-030-terminal-ai-online-offline-mode-switching`
  - **Assertions/evidence:**
    - Mode controls, platform note, and saved provider/mode value.
    - Mobile-web assertion: Offline/Ollama controls remain hidden because the mobile baseline treats Offline mode as unsupported.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-031 — Ollama available detection**
  - **Scope:** Device-local app preferences and platform capability.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Not required
      - **Status:** Consistent
      - **Reason:** Offline Ollama mode is hidden on mobile web to match the mobile/native unsupported baseline.
    - `mobile-web-android`: Not required
      - **Status:** Consistent
      - **Reason:** Offline Ollama mode is hidden on mobile web to match the mobile/native unsupported baseline.
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** Offline Ollama mode is hidden or unsupported on this mobile/native baseline.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** Offline Ollama mode is hidden or unsupported on this mobile/native baseline.
  - **Scenario overview:** User selects Offline mode with a reachable local Ollama server and confirms available detection plus saved model state.
  - **Interaction coverage:**
    - **Controls/actions:** Select Offline mode and observe Ollama detection when local Ollama has models.
    - **Platform paths:**
      - Desktop web and Tauri desktop use Preferences → AI Settings → Offline mode.
      - Mobile web is Not required and should hide/avoid Offline mode in the mobile baseline.
      - Native iOS/Android are Not required and should not require local Ollama detection.
    - **Micro-states:**
      - AI is enabled and Offline mode is selected.
      - Detection starts and shows Detecting Ollama.
      - Local `http://127.0.0.1:11434/api/tags` returns models.
      - Available status appears.
      - First/selected model is saved.
    - **Post-state effects:**
      - Ollama detected copy is visible.
      - aiSettings.ollamaModel persists.
      - Provider remains `ollama` after reload/reopen.
      - No BYOK/cloud provider key is required for this local path.
    - **Intersections:**
      - Local Ollama reachable with at least one model.
      - Desktop browser direct localhost access.
      - Tauri desktop localhost access.
      - Mobile web hidden/unsupported Offline mode.
      - Native mobile not required.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Local Ollama service or fixture returns models from `/api/tags`.
      - AiSection checkOllama can fetch localhost.
      - AI settings persistence can save `ollamaModel`.
    - **Direct effects:**
      - User confirms Offline AI can use a local Ollama model.
    - **Downstream effects:**
      - Reader/assistant local AI flows can select the saved Ollama model.
      - Establishes successful local-provider baseline before SET-032 unavailable path.
      - Confirms mobile-web Offline/Ollama controls remain hidden if covered.
    - **Platform guardrails:**
      - Desktop supported platforms should not be blocked by UI gating.
      - Mobile/native not-required platforms must be documented rather than treated as failed if skipped.
      - Tauri desktop must preserve local network permission behavior.
    - **Must-not-change guardrails:**
      - Detection must not require or expose BYOK secrets.
      - Detection must not mutate account, storage, sync, billing, API keys, or preferences beyond AI provider/model settings.
      - Detection must not sign the user out.
      - Detection must not falsely show available when no model exists.
  - **Preconditions:** Desktop/web environment with local Ollama server and models.
  - **Start state:** Offline mode is selected or being selected.
  - **Transient states:** Detection probes local Ollama and may show detecting state.
  - **Terminal states:** Success = available model/status appears and first/selected model saves; Cancel = user switches back to Online; Error = available server reported unavailable.
  - **Screenshot evidence:**
    - `SET-031-start-ollama-available-detection`
    - Optional: `SET-031-transient-ollama-available-detection if observable`
    - `SET-031-terminal-ollama-available-detection`
  - **Assertions/evidence:**
    - Detecting/available copy, selected model, and saved setting.
    - Mobile-web assertion: Offline/Ollama controls remain hidden because the mobile baseline treats Offline mode as unsupported.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup. Ollama availability depends on a local service or fixture; classify environment failures before changing code or docs.
- [ ] **SET-032 — Ollama unavailable detection**
  - **Scope:** Device-local app preferences and platform capability.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Not required
      - **Status:** Consistent
      - **Reason:** Offline Ollama mode is hidden on mobile web to match the mobile/native unsupported baseline.
    - `mobile-web-android`: Not required
      - **Status:** Consistent
      - **Reason:** Offline Ollama mode is hidden on mobile web to match the mobile/native unsupported baseline.
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** Offline Ollama mode is hidden or unsupported on this mobile/native baseline.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** Offline Ollama mode is hidden or unsupported on this mobile/native baseline.
  - **Scenario overview:** User selects Offline mode without a reachable local Ollama server and confirms unavailable guidance plus recovery path.
  - **Interaction coverage:**
    - **Controls/actions:** Select Offline mode with local Ollama absent/unreachable and observe unavailable detection.
    - **Platform paths:**
      - Desktop web and Tauri desktop use Preferences → AI Settings → Offline mode.
      - Mobile web is Not required and should hide/avoid Offline mode in the mobile baseline.
      - Native iOS/Android are Not required and should not require local Ollama detection.
    - **Micro-states:**
      - AI is enabled and Offline mode is selected.
      - Detection starts and shows Detecting Ollama.
      - Local Ollama request fails or returns no models.
      - Ollama not detected warning appears.
      - Install/recovery link is visible.
    - **Post-state effects:**
      - User sees unavailable status instead of silent failure.
      - Provider may remain Offline/Ollama but no usable model is proven.
      - User can switch back to Online mode.
      - No cloud/BYOK key is modified by local failure.
    - **Intersections:**
      - Localhost connection refused/offline.
      - No models returned.
      - Desktop recovery guidance.
      - Mobile web hidden/unsupported Offline mode.
      - Native mobile not required.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Ollama service is absent/unreachable or fixture returns no models.
      - AiSection checkOllama handles fetch failure.
      - Recovery link/copy renders in unavailable state.
    - **Direct effects:**
      - User receives clear feedback that local Offline AI is not ready.
    - **Downstream effects:**
      - Prevents Reader/assistant local AI testing from assuming Ollama availability.
      - Provides failure classification for local environment versus product UI issues.
      - Confirms mobile-web hidden/unsupported behavior if covered.
    - **Platform guardrails:**
      - Desktop warning/recovery copy must remain visible.
      - Mobile/native not-required platforms must be documented rather than treated as failed if skipped.
      - Tauri desktop must not hang indefinitely on localhost failure.
    - **Must-not-change guardrails:**
      - Unavailable detection must not mark a model available.
      - Unavailable detection must not erase BYOK keys or cloud provider settings.
      - Unavailable detection must not mutate account, storage, sync, billing, API keys, or Reader content.
      - Unavailable detection must not sign the user out.
  - **Preconditions:** Environment without reachable local Ollama.
  - **Start state:** Offline mode is selected or being selected.
  - **Transient states:** Detection probe fails or returns no models.
  - **Terminal states:** Success = unavailable status and recovery guidance are visible; Cancel = user switches back to Online; Error = silent failure or stuck detecting.
  - **Screenshot evidence:**
    - `SET-032-start-ollama-unavailable-detection`
    - Optional: `SET-032-transient-ollama-unavailable-detection if observable`
    - `SET-032-terminal-ollama-unavailable-detection`
  - **Assertions/evidence:**
    - Unavailable copy, no-model state, and recovery path.
    - Mobile-web assertion: Offline/Ollama controls remain hidden because the mobile baseline treats Offline mode as unsupported.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup. Ollama unavailability should be fixture-controlled where possible; classify environment failures before changing code or docs.
- [ ] **SET-033 — BYOK gated Free/no-access state**
  - **Scope:** Secret/integration credentials.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** Free/no-access user views BYOK and confirms the gated state, CTA, and saved-key caveat are clear.
  - **Interaction coverage:**
    - **Controls/actions:** Open Preferences → AI Settings as a user without BYOK entitlement.
    - **Platform paths:**
      - All required Settings platforms use the BYOK section in the AI Settings card.
      - Mobile/native platforms validate gated copy, badge, and CTA fit in narrow layout.
    - **Micro-states:**
      - BYOK feature gate evaluates.
      - Reader+ badge/gated copy appears.
      - Upgrade CTA appears.
      - Provider/key input controls are absent or disabled.
      - Saved-key removal caveat is captured if downgraded fixture has existing keys.
    - **Post-state effects:**
      - No raw key entry or save/test path is available to no-access users.
      - Existing raw provider keys are not exposed.
      - User can navigate to upgrade path if CTA is activated.
      - Settings remains usable.
    - **Intersections:**
      - Free/no-access user with no saved BYOK keys.
      - Downgraded/free user with saved BYOK keys.
      - BYOK gate message and CTA.
      - Mobile/native gated layout.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - useFeatureGate('byok') returns not allowed.
      - AiSection renders gated BYOK branch.
      - Provider-key hook must not expose decrypted keys.
    - **Direct effects:**
      - User sees that BYOK requires Reader/Pro access.
    - **Downstream effects:**
      - Prevents SET-034 through SET-036 from running with Free/no-access fixtures.
      - Supports Billing upgrade messaging and plan-gate validation.
      - Documents the downgraded saved-key removal caveat for future UX decisions.
    - **Platform guardrails:**
      - Gated copy and CTA must remain readable/tappable on mobile/native.
      - Tauri/native shells must not accidentally expose hidden BYOK form controls.
    - **Must-not-change guardrails:**
      - Gated view must not save, test, reveal, or remove provider keys.
      - Gated view must not mutate AI provider/mode unless user changes separate controls.
      - Gated view must not sign the user out.
      - Gated view must not imply platform/MCP API keys are the same as BYOK keys.
  - **Preconditions:** Free/no-access user on Preferences AI Settings.
  - **Start state:** BYOK section is reached without feature access.
  - **Transient states:** Gate evaluates feature availability.
  - **Terminal states:** Success = upgrade/gated state appears and raw keys are not exposed; Cancel = not applicable; Error = save/remove controls appear incorrectly or existing keys are trapped without path.
  - **Screenshot evidence:**
    - `SET-033-start-byok-gated-free-no-access-state`
    - Optional: `SET-033-transient-byok-gated-free-no-access-state if observable`
    - `SET-033-terminal-byok-gated-free-no-access-state`
  - **Assertions/evidence:**
    - Gated copy, CTA, and absence/presence of controls.
    - Known BYOK caveat: downgraded/free users with previously saved keys may be unable to remove them from the gated UI; capture that state if the fixture includes saved keys.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-034 — BYOK provider key save/test success**
  - **Scope:** Secret/integration credentials.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** Reader/Pro user saves and tests a disposable BYOK provider key, then confirms only masked server-side key state remains visible.
  - **Interaction coverage:**
    - **Controls/actions:** Select provider, enter key, optionally show/hide key, Test Connection, Save, and verify saved row.
    - **Platform paths:**
      - All required Settings platforms use Preferences → AI Settings → BYOK form.
      - Mobile/native platforms validate provider dropdown/search, key input keyboard, show/hide control, and saved-row layout.
    - **Micro-states:**
      - BYOK controls are visible for allowed plan.
      - Provider dropdown opens/searches/selects provider.
      - API key input accepts disposable key and show/hide toggles raw visibility locally.
      - Test Connection enters testing state and saves before testing.
      - Success result appears when provider fixture validates.
      - Saved Keys row shows provider, prefix, and Valid badge.
    - **Post-state effects:**
      - Provider key is stored server-side encrypted and raw key is not re-exposed after save/reload.
      - Saved key row uses masked/prefix display.
      - Test status and toast/copy communicate result.
      - AI provider/mode remains unchanged unless separately changed.
    - **Intersections:**
      - Reader/Pro BYOK entitlement.
      - Provider dropdown search and selection.
      - Key show/hide before save.
      - Test Connection success.
      - Save success plus reload.
    - **Known caveat:** Test Connection saves the key before testing it, so failed tests can still leave a saved masked row.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - useFeatureGate('byok') allows access.
      - useProviderKeys can add, fetch, and test provider keys through `/api/settings/api-keys`.
      - Provider test endpoint or fixture can validate the disposable key.
    - **Direct effects:**
      - User stores a BYOK provider credential and sees validation status.
    - **Downstream effects:**
      - Reader/assistant provider selection can use saved BYOK credentials where supported.
      - SET-035 can start from the saved-key row.
      - SET-036 can compare invalid/untestable provider behavior against the success path.
    - **Platform guardrails:**
      - Mobile/native key input must not leak raw key through screenshots except intentional redacted evidence.
      - Tauri/native remote API path for BYOK uses `getProductAPIBaseUrl()` and canonical `apps/api` `/api/settings/api-keys`, remaining distinct from platform/MCP `/api/api-keys` keys.
    - **Must-not-change guardrails:**
      - Saving BYOK must not create Openread platform/MCP API keys.
      - Saving BYOK must not expose raw key after reload.
      - Saving BYOK must not mutate account, storage, sync, billing, platform API keys, or Reader content.
      - Saving BYOK must not sign the user out.
  - **Preconditions:** Reader/Pro user with disposable provider key.
  - **Start state:** BYOK controls are visible and provider is selected.
  - **Transient states:** User enters key; Test Connection/Save submits and may show pending state.
  - **Terminal states:** Success = key saves server-side, masked row appears, and valid/test result is clear; Cancel = user clears field before save; Error = invalid/failure state appears without exposing raw key.
  - **Screenshot evidence:**
    - `SET-034-start-byok-provider-key-save-test-success`
    - Optional: `SET-034-transient-byok-provider-key-save-test-success if observable`
    - `SET-034-terminal-byok-provider-key-save-test-success`
  - **Assertions/evidence:**
    - Masked saved-key row, test result, provider, and no raw key after reload.
    - Known BYOK caveat: Test Connection saves the key before testing it, so failed tests can still leave a saved masked key row.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup. BYOK provider checks depend on live provider APIs or fixtures; classify provider/network failures before changing code or docs.
- [ ] **SET-035 — BYOK provider key remove**
  - **Scope:** Secret/integration credentials.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** Reader/Pro user removes a saved BYOK provider key and confirms the saved-key row disappears without exposing the raw key.
  - **Interaction coverage:**
    - **Controls/actions:** Click the saved-key row Remove/trash control for a disposable provider key.
    - **Platform paths:**
      - All required Settings platforms use Preferences → AI Settings → Saved Keys row removal.
      - Mobile/native platforms validate the small row-level remove control and resulting row layout.
    - **Micro-states:**
      - Saved Keys list is visible.
      - Target provider row shows masked prefix and status badge.
      - Remove/trash control is activated.
      - Delete request runs.
      - Row disappears or list refreshes.
    - **Post-state effects:**
      - Provider key is removed from saved-key list.
      - Raw key is never shown during removal.
      - Other saved provider keys remain unchanged.
      - BYOK form remains usable for new keys if entitlement allows.
    - **Intersections:**
      - Single saved disposable key.
      - Multiple saved keys where non-target rows remain.
      - Remove success.
      - Remove failure preserving row if fixture forces failure.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - useProviderKeys exposes saved keys and removeKey.
      - Canonical `apps/api` `/api/settings/api-keys/[provider]` delete route or fixture is available.
      - Saved row can be identified by provider/prefix without raw key.
    - **Direct effects:**
      - User removes a BYOK provider credential.
    - **Downstream effects:**
      - Reader/assistant calls using that provider should no longer rely on the removed key.
      - SET-033 downgraded-user caveat can be compared against allowed-user removal.
      - Future BYOK save/test scenarios can start from a clean provider state.
    - **Platform guardrails:**
      - Row-level remove control must remain tappable on mobile/native.
      - Tauri/native remote API behavior for BYOK removal must remain distinct from platform/MCP key revocation.
    - **Must-not-change guardrails:**
      - Removing BYOK must not revoke platform/MCP API keys.
      - Removing one provider key must not remove other provider keys.
      - Removing BYOK must not mutate account, storage, sync, billing, preferences, or Reader content.
      - Removing BYOK must not sign the user out.
  - **Preconditions:** Reader/Pro user with saved disposable provider key.
  - **Start state:** Saved-key row is visible.
  - **Transient states:** Remove action submits and list refreshes.
  - **Terminal states:** Success = provider key row disappears and raw key is not exposed; Cancel = if confirmation exists, cancel preserves row; Error = failure copy appears and row remains accurate.
  - **Screenshot evidence:**
    - `SET-035-start-byok-provider-key-remove`
    - Optional: `SET-035-transient-byok-provider-key-remove if observable`
    - `SET-035-terminal-byok-provider-key-remove`
  - **Assertions/evidence:**
    - Before/after saved-key list and remove result.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-036 — BYOK invalid/untestable provider state**
  - **Scope:** Secret/integration credentials.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** Reader/Pro user tests an invalid or untestable BYOK provider key and confirms the state is labelled accurately without exposing the raw key.
  - **Interaction coverage:**
    - **Controls/actions:** Select provider, enter invalid/untestable key, run Test Connection or Save, and observe invalid/untested result.
    - **Platform paths:**
      - All required Settings platforms use Preferences → AI Settings → BYOK form.
      - Mobile/native platforms validate provider dropdown, error copy, key visibility toggle, and status badge layout.
    - **Micro-states:**
      - BYOK controls are visible for allowed plan.
      - Provider and key are entered.
      - Test Connection enters testing state.
      - Test endpoint returns invalid, untestable, or provider-specific failure.
      - Invalid badge/copy or error message appears.
      - Saved row may appear invalid if the key was saved before test.
    - **Post-state effects:**
      - User can distinguish invalid/untested from valid.
      - Raw key is not re-exposed after save/reload.
      - User can remove or replace the provider key if row exists.
      - Provider failures are classified as fixture/live-service dependent where applicable.
    - **Intersections:**
      - Invalid key fixture.
      - Provider unsupported by current test endpoint.
      - Saved-before-test caveat.
      - Mobile/native error/status display.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - useProviderKeys testKey returns validity/error result.
      - Provider test endpoint or fixture can simulate invalid/untestable response.
      - AiSection can display invalid status and error copy.
    - **Direct effects:**
      - User sees that the BYOK credential is not currently verified as usable.
    - **Downstream effects:**
      - Prevents Reader/assistant tests from assuming BYOK provider availability.
      - Provides failure semantics for BYOK provider integration validation.
      - Documents providers that cannot be verified by current test endpoint.
    - **Platform guardrails:**
      - Error/status copy must remain visible on mobile/native.
      - Tauri/native remote API failures must be classified separately from UI regressions.
    - **Must-not-change guardrails:**
      - Invalid/untestable state must not be labelled confidently valid.
      - Invalid/untestable state must not expose raw key after save/reload.
      - Invalid/untestable state must not mutate platform/MCP API keys, account, storage, sync, billing, or Reader content.
      - Invalid/untestable state must not sign the user out.
  - **Preconditions:** Reader/Pro user with invalid key or provider that cannot be verified.
  - **Start state:** BYOK controls are visible for selected provider.
  - **Transient states:** Test/save attempt runs or provider verification is unavailable.
  - **Terminal states:** Success = invalid/untested state is labelled accurately; Cancel = user abandons without save; Error = untested key appears confidently valid.
  - **Screenshot evidence:**
    - `SET-036-start-byok-invalid-untestable-provider-state`
    - Optional: `SET-036-transient-byok-invalid-untestable-provider-state if observable`
    - `SET-036-terminal-byok-invalid-untestable-provider-state`
  - **Assertions/evidence:**
    - Provider, status badge/copy, and any error response.
    - Known BYOK caveat: untested keys can appear Invalid, and some listed providers cannot be verified by the current test endpoint.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup. BYOK provider checks depend on live provider APIs or fixtures; classify provider/network failures before changing code or docs.
- [ ] **SET-037 — Notification preference toggles**
  - **Scope:** Device-local app preferences.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User toggles notification preferences and confirms the three notification flags persist in local storage after reload.
  - **Interaction coverage:**
    - **Controls/actions:** Toggle Reading Reminders, Sync Notifications, and Product Updates.
    - **Platform paths:**
      - All required Settings platforms use Preferences → Notifications toggles.
      - Mobile/native platforms validate toggle touch targets and persisted state after reload/reopen.
    - **Micro-states:**
      - Starting toggle values are recorded.
      - Each toggle changes independently.
      - `localStorage.notificationPreferences` updates.
      - Reload/reopen rehydrates the saved values.
      - Toggling back restores prior values.
    - **Post-state effects:**
      - Notification preferences persist locally.
      - Each flag remains independent of the others.
      - No server-side account or billing state is changed.
    - **Intersections:**
      - Reading reminders on/off.
      - Sync notifications on/off.
      - Product updates on/off.
      - Missing/corrupt localStorage fallback to defaults.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - NotificationsSection reads/writes `localStorage.notificationPreferences`.
      - Browser/WebView localStorage is available.
      - Default notification preference fallback is defined.
    - **Direct effects:**
      - User changes local notification preference flags.
    - **Downstream effects:**
      - Future notification/reminder behavior should honor saved flags.
      - Clear Local Preferences and Reset Preferences should remove/reset these flags in SET-042 and SET-044.
      - Provides localStorage evidence for preference persistence validation.
    - **Platform guardrails:**
      - Mobile/native localStorage persistence must survive reload/reopen where supported.
      - Toggle state must remain visible in narrow layouts.
    - **Must-not-change guardrails:**
      - Notification toggles must not mutate account, storage, sync setting, billing, API keys, BYOK keys, theme, or Reader settings.
      - Notification toggles must not sign the user out.
      - One notification toggle must not unintentionally change the other two.
      - Corrupt localStorage fallback must not crash Settings.
  - **Preconditions:** User on Preferences tab.
  - **Start state:** Notifications card shows current toggle values.
  - **Transient states:** User toggles reading reminders, sync notifications, and product updates.
  - **Terminal states:** Success = toggles persist in `localStorage.notificationPreferences`; Cancel = toggling back restores prior values; Error = reload resets unexpectedly.
  - **Screenshot evidence:**
    - `SET-037-start-notification-preference-toggles`
    - Optional: `SET-037-transient-notification-preference-toggles if observable`
    - `SET-037-terminal-notification-preference-toggles`
  - **Assertions/evidence:**
    - Before/after toggle values, localStorage value, and reload state.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-038 — Telemetry privacy toggle**
  - **Scope:** Device-local app preferences.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User toggles usage analytics and confirms telemetry preference persistence without affecting other privacy/data controls.
  - **Interaction coverage:**
    - **Controls/actions:** Toggle Usage Analytics in the Privacy card.
    - **Platform paths:**
      - All required Settings platforms use Preferences → Privacy → Usage Analytics toggle.
      - Mobile/native platforms validate toggle touch target and persisted state after reload/reopen.
    - **Micro-states:**
      - Starting telemetry value is recorded.
      - Toggle changes value.
      - Settings save persists telemetryEnabled.
      - Reload/reopen rehydrates the saved value.
      - Toggling back restores prior value.
    - **Post-state effects:**
      - Telemetry preference persists in settings.
      - Download My Data and Clear Local Preferences controls remain available.
      - Other preferences are unchanged.
    - **Intersections:**
      - Telemetry enabled to disabled.
      - Telemetry disabled to enabled.
      - Web local/app settings persistence.
      - Tauri/native appService persistence.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - PrivacySection reads/writes settings.telemetryEnabled.
      - useSettingsStore/appService persist settings.
      - Privacy card remains mounted with data controls.
    - **Direct effects:**
      - User changes the local telemetry/privacy preference.
    - **Downstream effects:**
      - Analytics collection should honor the saved preference where wired.
      - Reset Preferences should restore telemetry default in SET-044.
      - Clear Local Preferences should not be confused with telemetry toggle behavior.
    - **Platform guardrails:**
      - Toggle state must remain visible on mobile/native.
      - Tauri/native persistence must survive reload/reopen.
    - **Must-not-change guardrails:**
      - Telemetry toggle must not start data export or clear local preferences.
      - Telemetry toggle must not mutate account, storage, sync, billing, API keys, BYOK keys, theme, or Reader settings.
      - Telemetry toggle must not sign the user out.
      - Telemetry toggle must not alter notification preferences.
  - **Preconditions:** User on Preferences Privacy card.
  - **Start state:** Telemetry value is known.
  - **Transient states:** User toggles telemetry.
  - **Terminal states:** Success = telemetry preference persists in documented settings scope; Cancel = toggling back restores prior value; Error = UI and persisted value diverge.
  - **Screenshot evidence:**
    - `SET-038-start-telemetry-privacy-toggle`
    - Optional: `SET-038-transient-telemetry-privacy-toggle if observable`
    - `SET-038-terminal-telemetry-privacy-toggle`
  - **Assertions/evidence:**
    - Toggle value, stored setting, and reload state.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-039 — Download My Data success**
  - **Scope:** Settings.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User downloads their data successfully and confirms a JSON export artifact is produced without altering Settings state.
  - **Interaction coverage:**
    - **Controls/actions:** Click Download My Data and capture the browser/native download event or artifact.
    - **Platform paths:**
      - Web platforms use the browser download event and file attachment.
      - Tauri desktop validates native/WebView download handling or delegated browser behavior.
      - Mobile/native platforms validate download/export handoff and recoverable terminal state.
    - **Micro-states:**
      - Privacy card is stable and Download My Data is enabled.
      - Export request starts and button may show Exporting.
      - Authenticated GET request includes bearer token.
      - Response returns downloadable blob and filename.
      - File download is initiated.
    - **Post-state effects:**
      - JSON export file is available as evidence.
      - Export error is absent.
      - Privacy card remains usable after download.
      - No data is cleared or reset.
    - **Intersections:**
      - Successful export with default filename.
      - Successful export with Content-Disposition filename.
      - Browser download event versus native/mobile handoff.
      - Authenticated token present.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Auth token is available.
      - Export API/live fixture returns JSON/blob response.
      - Browser/WebView download mechanism is available or classifiable.
    - **Direct effects:**
      - User receives a data export artifact.
    - **Downstream effects:**
      - Provides evidence for data portability/privacy compliance checks.
      - Confirms export does not clear or mutate local/server Settings state.
      - Establishes success baseline before SET-040 rate-limit/error validation.
    - **Platform guardrails:**
      - Download must be captured or explicitly classified on mobile/native platforms.
      - Tauri/native download or external handoff must not leave Settings unusable.
      - WebKit/Safari download behavior must be recorded as artifact or platform note.
    - **Must-not-change guardrails:**
      - Export must not clear local preferences.
      - Export must not mutate account, storage, sync, billing, API keys, BYOK keys, or Reader settings.
      - Export must not sign the user out.
      - Export must not expose raw secrets in screenshots or logs.
  - **Preconditions:** Authenticated user with export allowed and bearer token available.
  - **Start state:** Privacy card is stable and Download My Data is enabled.
  - **Transient states:** Export request submits; download may be pending.
  - **Terminal states:** Success = JSON export downloads with expected filename; Cancel = browser download canceled by user/system; Error = visible error/rate-limit state instead of silent failure.
  - **Screenshot evidence:**
    - `SET-039-start-download-my-data-success`
    - Optional: `SET-039-transient-download-my-data-success if observable`
    - `SET-039-terminal-download-my-data-success`
  - **Assertions/evidence:**
    - Downloaded filename/file presence or browser download event.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup. Data export depends on the export API and browser/native download handling; classify service or download failures before changing code or docs.
- [ ] **SET-040 — Download My Data rate-limit/error**
  - **Scope:** Settings.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User triggers a data-export rate-limit or failure and confirms visible error feedback without a misleading download.
  - **Interaction coverage:**
    - **Controls/actions:** Click Download My Data under a 429/rate-limit or forced export failure fixture.
    - **Platform paths:**
      - All required Settings platforms use Preferences → Privacy → Download My Data.
      - Mobile/native platforms validate error copy visibility and safe recovery after failed handoff.
    - **Micro-states:**
      - Privacy card is stable before export.
      - Export request starts and button may show Exporting.
      - API returns 429 or error response.
      - Error text appears under the data controls.
      - Download event/artifact does not appear.
    - **Post-state effects:**
      - User-visible rate-limit/error copy is present.
      - Button recovers from Exporting state.
      - No misleading file is downloaded.
      - User can retry later or leave safely.
    - **Intersections:**
      - 429 rate-limit fixture.
      - Generic export failure fixture.
      - Missing auth/token failure if applicable.
      - Mobile/native failed download handoff.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Export API/fixture can return rate-limit or error response.
      - PrivacySection maps 429 to rate-limit copy and other errors to export failure copy.
      - Download handling can prove absence of artifact.
    - **Direct effects:**
      - User is told export did not complete.
    - **Downstream effects:**
      - Prevents downstream QA from treating failed export as valid data artifact.
      - Supports rate-limit policy validation.
      - Confirms Privacy card remains recoverable after external service failure.
    - **Platform guardrails:**
      - Error copy must remain visible on mobile/native.
      - WebKit/mobile download quirks must not be misclassified as successful export.
      - Tauri/native handoff failure must return the user to usable Settings state.
    - **Must-not-change guardrails:**
      - Export failure must not clear local preferences.
      - Export failure must not mutate account, storage, sync, billing, API keys, BYOK keys, or Reader settings.
      - Export failure must not sign the user out.
      - Export failure must not leave button permanently disabled/loading.
  - **Preconditions:** Authenticated user with rate-limit or forced export failure fixture.
  - **Start state:** Privacy card is stable.
  - **Transient states:** Export request submits and API returns 429 or error.
  - **Terminal states:** Success = not applicable for failure fixture; Cancel = user can retry later/leave safely; Error = user-visible rate-limit/error copy appears.
  - **Screenshot evidence:**
    - `SET-040-start-download-my-data-rate-limit-error`
    - Optional: `SET-040-transient-download-my-data-rate-limit-error if observable`
    - `SET-040-terminal-download-my-data-rate-limit-error`
  - **Assertions/evidence:**
    - 429/error copy and absence of misleading downloaded file.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup. Data export error/rate-limit behavior depends on API fixtures or live service responses; classify failures before changing code or docs.
- [ ] **SET-041 — Clear Local Preferences cancel**
  - **Scope:** Device-local app preferences and destructive/reset blast-radius.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User opens Clear Local Preferences and cancels, confirming no local preference keys are removed.
  - **Interaction coverage:**
    - **Controls/actions:** Click Clear Local Preferences, inspect confirmation dialog, then cancel/dismiss.
    - **Platform paths:**
      - All required Settings platforms use Preferences → Privacy → Clear Local Preferences.
      - Mobile/native platforms validate alert dialog fit, copy visibility, and safe dismissal.
    - **Micro-states:**
      - Local preference keys are seeded and recorded.
      - Clear Local Preferences confirmation opens.
      - Scope copy is visible.
      - Cancel/dismiss is activated.
      - Dialog closes without clearing local keys.
    - **Post-state effects:**
      - `notificationPreferences`, `openread-preferences`, `customThemes`, and other seeded local values remain unchanged.
      - Auth/session remains active.
      - Books, progress, account, billing, API keys, and BYOK keys remain untouched.
      - Privacy card remains usable.
    - **Intersections:**
      - Cancel via button.
      - Dismiss/back/escape where supported.
      - Seeded local preferences before cancel.
      - Mobile/native dialog dismissal.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - PrivacySection opens Clear Local Preferences AlertDialog.
      - Cancel control closes the dialog without invoking clear handler.
      - LocalStorage/settings snapshots can be captured before and after.
    - **Direct effects:**
      - User safely abandons local preference clearing.
    - **Downstream effects:**
      - Preserves local preference state for SET-042 confirm validation.
      - Confirms destructive/reset blast-radius cancel semantics.
      - Provides before/after evidence for reset-scope documentation.
    - **Platform guardrails:**
      - Dialog cancel must remain reachable on mobile/native safe areas.
      - Back/escape must not accidentally confirm clearing.
    - **Must-not-change guardrails:**
      - Cancel must not remove any localStorage or settings keys.
      - Cancel must not remove books, progress, auth, account, billing, API keys, BYOK keys, custom fonts/textures, or Reader settings.
      - Cancel must not sign the user out.
      - Cancel must not leave stale clearing/loading state.
  - **Preconditions:** User on Preferences Privacy card with local preferences set.
  - **Start state:** Clear Local Preferences confirmation can be opened.
  - **Transient states:** Confirmation dialog opens and user cancels.
  - **Terminal states:** Success = not applicable; Cancel = local preferences remain unchanged; Error = cancel clears data.
  - **Screenshot evidence:**
    - `SET-041-start-clear-local-preferences-cancel`
    - Optional: `SET-041-transient-clear-local-preferences-cancel if observable`
    - `SET-041-terminal-clear-local-preferences-cancel`
  - **Assertions/evidence:**
    - Before/after localStorage/settings values and dialog state.
    - Known scope caveat: Clear Local Preferences affects only documented local preference keys, not books, progress, auth, account, billing, API keys, custom fonts/textures, or all Reader settings.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-042 — Clear Local Preferences confirm**
  - **Scope:** Device-local app preferences and destructive/reset blast-radius.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User confirms Clear Local Preferences and verifies only the documented local preference keys are removed.
  - **Interaction coverage:**
    - **Controls/actions:** Open Clear Local Preferences confirmation and click Clear Preferences.
    - **Platform paths:**
      - All required Settings platforms use Preferences → Privacy → Clear Local Preferences confirmation.
      - Mobile/native platforms validate confirm action, clearing state, and post-clear reload behavior.
    - **Micro-states:**
      - Target local keys are seeded and recorded.
      - Confirmation dialog is open.
      - Confirm enters Clearing state if observable.
      - Documented local keys are removed.
      - Dialog closes and reload/reopen verifies result.
    - **Post-state effects:**
      - Documented keys such as `notificationPreferences`, `openread-preferences`, and `customThemes` are removed.
      - Auth/session remains active.
      - Books, progress, account, billing, server-side API keys, and BYOK keys remain intact.
      - Theme mode/color behavior follows documented scope and current implementation caveat.
    - **Intersections:**
      - Seeded notification preferences.
      - Seeded openread preferences.
      - Seeded custom themes.
      - Reload/reopen after clear.
      - Mobile/native localStorage persistence scope.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - PrivacySection clear handler removes the documented localStorage keys.
      - LocalStorage snapshots can prove removed/preserved keys.
      - Auth and server data fixtures can prove guardrails.
    - **Direct effects:**
      - User clears the defined local preference subset.
    - **Downstream effects:**
      - Notifications should fall back to defaults after clear.
      - Some local preference-dependent UI may rehydrate from defaults.
      - Confirms this flow is narrower than account deletion or full preference reset.
    - **Platform guardrails:**
      - Mobile/native WebView localStorage behavior must be captured after reload/reopen.
      - Tauri/native app settings outside localStorage must not be assumed cleared unless evidence proves it.
    - **Must-not-change guardrails:**
      - Clear Local Preferences must not remove books, progress, auth/session, account, billing, platform API keys, BYOK keys, custom fonts/textures, or all Reader settings.
      - Clear Local Preferences must not sign the user out.
      - Clear Local Preferences must not start data export or reset all preferences.
      - Clear Local Preferences must not leave stale dialog/loading state.
  - **Preconditions:** User on Preferences Privacy card with local preferences set.
  - **Start state:** Confirmation dialog is open.
  - **Transient states:** Confirm clears documented local keys.
  - **Terminal states:** Success = documented local preferences clear; Cancel = not applicable after confirm; Error = books/progress/auth/account/billing/server keys are removed or local keys remain uncleared.
  - **Screenshot evidence:**
    - `SET-042-start-clear-local-preferences-confirm`
    - Optional: `SET-042-transient-clear-local-preferences-confirm if observable`
    - `SET-042-terminal-clear-local-preferences-confirm`
  - **Assertions/evidence:**
    - Removed keys, preserved books/progress/auth/account/billing/server-key state, and reload result.
    - Known scope caveat: Clear Local Preferences affects only documented local preference keys, not books, progress, auth, account, billing, API keys, custom fonts/textures, or all Reader settings.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-043 — Reset Preferences cancel**
  - **Scope:** Device-local app preferences and destructive/reset blast-radius.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User opens Reset Preferences and cancels, confirming changed preferences remain unchanged.
  - **Interaction coverage:**
    - **Controls/actions:** Click Reset to Defaults, inspect confirmation dialog, then cancel/dismiss.
    - **Platform paths:**
      - All required Settings platforms use Preferences → Reset Preferences → Reset to Defaults confirmation.
      - Mobile/native platforms validate alert dialog fit, warning copy visibility, and safe dismissal.
    - **Micro-states:**
      - Changed preferences are seeded and recorded.
      - Reset confirmation dialog opens.
      - Reset scope/warning copy is visible.
      - Cancel/dismiss is activated.
      - Dialog closes and seeded values remain.
    - **Post-state effects:**
      - Theme, notification, AI, telemetry, and reading defaults remain at pre-cancel values.
      - Auth/session remains active.
      - Books, progress, account, billing, API keys, and BYOK keys remain untouched.
    - **Intersections:**
      - Cancel via button.
      - Dismiss/back/escape where supported.
      - Changed theme/AI/reading/notification/telemetry fixtures.
      - Mobile/native dialog dismissal.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - ResetPreferences opens AlertDialog.
      - Cancel control closes the dialog without invoking reset handler.
      - Preference snapshots can be captured before and after.
    - **Direct effects:**
      - User safely abandons full preference reset.
    - **Downstream effects:**
      - Preserves changed preference fixture for SET-044 confirm validation.
      - Confirms destructive/reset cancel semantics.
      - Separates reset confirmation from Clear Local Preferences behavior.
    - **Platform guardrails:**
      - Dialog cancel must remain reachable on mobile/native safe areas.
      - Back/escape must not accidentally confirm reset.
    - **Must-not-change guardrails:**
      - Cancel must not reset any preference values.
      - Cancel must not remove books, progress, auth, account, billing, platform API keys, BYOK keys, custom fonts/textures, or Reader settings.
      - Cancel must not sign the user out.
      - Cancel must not leave stale resetting/loading state.
  - **Preconditions:** User on Preferences Reset card with changed preferences.
  - **Start state:** Reset Preferences confirmation can be opened.
  - **Transient states:** Confirmation dialog opens and user cancels.
  - **Terminal states:** Success = not applicable; Cancel = all changed preferences remain; Error = cancel resets values.
  - **Screenshot evidence:**
    - `SET-043-start-reset-preferences-cancel`
    - Optional: `SET-043-transient-reset-preferences-cancel if observable`
    - `SET-043-terminal-reset-preferences-cancel`
  - **Assertions/evidence:**
    - Before/after setting values and dialog state.
    - Known scope caveat: Reset Preferences restores defined preference defaults only; it does not reset books, progress, auth, account, billing, API keys, custom fonts/textures, or all Reader settings.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-044 — Reset Preferences confirm**
  - **Scope:** Device-local app preferences and destructive/reset blast-radius.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User confirms Reset Preferences and verifies only the documented preference defaults are restored.
  - **Interaction coverage:**
    - **Controls/actions:** Open Reset Preferences confirmation and click Reset.
    - **Platform paths:**
      - All required Settings platforms use Preferences → Reset Preferences → Reset confirmation.
      - Mobile/native platforms validate confirm action, resetting state, and post-reset reload behavior.
    - **Micro-states:**
      - Changed preferences are seeded and recorded.
      - Confirmation dialog is open.
      - Confirm enters Resetting state if observable.
      - Theme mode/color, AI settings, telemetry, notification preferences, and global reading defaults reset per implementation.
      - Dialog closes and reload/reopen verifies defaults.
    - **Post-state effects:**
      - Theme mode returns to auto and theme color to default.
      - Notification localStorage keys are removed.
      - AI settings return to defaults.
      - Telemetry returns to enabled/default.
      - Global reading font/size/line-height return to app defaults.
      - Books, progress, auth, account, billing, API keys, BYOK keys, custom fonts/textures, and all Reader settings outside documented scope are preserved.
    - **Intersections:**
      - Changed theme preferences.
      - Changed AI settings.
      - Changed notification preferences.
      - Changed telemetry setting.
      - Changed global reading defaults.
      - Reload/reopen after reset.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - ResetPreferences reset handler can access theme store, settings store, envConfig, and appService default view settings.
      - DEFAULT_AI_SETTINGS and appService default view settings are available.
      - LocalStorage and persisted settings snapshots can prove reset scope.
    - **Direct effects:**
      - User restores documented preference defaults.
    - **Downstream effects:**
      - Resets baselines used by SET-025 through SET-038.
      - Affects Reader default settings for future Reader sessions.
      - Confirms reset blast radius is narrower than account deletion and does not remove secrets/server data.
    - **Platform guardrails:**
      - Mobile/native reset confirmation and post-reset layout must remain usable.
      - Tauri/native appService persistence must reflect reset defaults after reload/reopen.
    - **Must-not-change guardrails:**
      - Reset Preferences must not remove books, progress, auth/session, account, billing, platform API keys, BYOK keys, custom fonts/textures, or all Reader settings.
      - Reset Preferences must not sign the user out.
      - Reset Preferences must not start data export or delete account.
      - Reset Preferences must not leave stale resetting/loading state.
  - **Preconditions:** User on Preferences Reset card with changed preferences.
  - **Start state:** Reset Preferences confirmation is open.
  - **Transient states:** Confirm resets documented settings/local keys.
  - **Terminal states:** Success = documented preferences return to defaults; Cancel = not applicable after confirm; Error = unrelated data is removed or expected defaults are not restored.
  - **Screenshot evidence:**
    - `SET-044-start-reset-preferences-confirm`
    - Optional: `SET-044-transient-reset-preferences-confirm if observable`
    - `SET-044-terminal-reset-preferences-confirm`
  - **Assertions/evidence:**
    - Default values after reload and preserved books/progress/auth/account/billing/server keys.
    - Known scope caveat: Reset Preferences restores defined preference defaults only; it does not reset books, progress, auth, account, billing, API keys, custom fonts/textures, or all Reader settings.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-045 — API key list empty/loading/existing**
  - **Scope:** Secret/integration credentials.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `tauri-windows`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
  - **Scenario overview:** User views the platform/MCP API-key list and confirms loading, empty, and existing-key states are distinct and secure.
  - **Interaction coverage:**
    - **Controls/actions:** Open the API Keys tab and observe skeleton, empty, and existing-row list states.
    - **Platform paths:**
      - Web desktop/mobile use `/settings/api-keys` with `/api/api-keys` backed by canonical `apps/api`.
      - Tauri desktop and native mobile validate API Keys tab absence and direct `/settings/api-keys` redirect to Account because API-key management is web-only.
    - **Micro-states:**
      - API Keys page opens.
      - Key list skeleton/loading rows render.
      - Empty state renders when no keys exist.
      - Existing rows render with description, masked prefix, created time, and Last used/Never used.
      - Raw existing keys are never displayed.
    - **Post-state effects:**
      - User can distinguish platform/MCP keys from BYOK provider keys.
      - Existing key rows remain masked.
      - Create API Key entry point remains available.
      - No key is created or revoked by viewing the list.
    - **Intersections:**
      - Empty key list fixture.
      - Existing key fixture.
      - Loading/slow request fixture.
      - Web-backed API success.
      - Non-web API Keys absence/direct redirect.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - useApiKeys fetches `/api/api-keys` with auth token.
      - ApiKeysPage renders loading, empty, and ApiKeyList states.
      - Existing rows use masked hash-derived prefix display.
    - **Direct effects:**
      - User can inspect platform/MCP key inventory safely.
    - **Downstream effects:**
      - Provides starting state for create, config copy, Last used, revoke, and error scenarios.
      - Confirms these keys are separate from BYOK provider keys in Preferences.
      - Documents API-key management as web-only and verifies non-web absence/redirect.
    - **Platform guardrails:**
      - Web list states must be accurate and secure.
      - Non-web absence/direct redirect must be recorded instead of treating API-key UI as required.
      - Mobile list rows must remain readable and expandable.
    - **Must-not-change guardrails:**
      - Viewing keys must not expose raw key material.
      - Viewing keys must not create, revoke, or update `last_used_at`.
      - Viewing keys must not mutate BYOK provider keys, billing, profile, storage, sync, or preferences.
      - Viewing keys must not sign the user out.
  - **Preconditions:** Authenticated user on API Keys tab with empty and existing-key fixtures.
  - **Start state:** API Keys page is opening.
  - **Transient states:** Key list request loads and resolves to empty or rows.
  - **Terminal states:** Success = skeleton/empty/existing states are clear and distinguish platform keys from BYOK; Cancel = not applicable; Error = misleading empty state or exposed raw existing key.
  - **Screenshot evidence:**
    - `SET-045-start-api-key-list-empty-loading-existing`
    - Optional: `SET-045-transient-api-key-list-empty-loading-existing if observable`
    - `SET-045-terminal-api-key-list-empty-loading-existing`
  - **Assertions/evidence:**
    - Loading/empty/row captures and masked key display.
    - Known MCP policy caveat: platform/MCP API keys are not plan-gated even when Billing copy implies MCP requires an upgrade.
    - Known MCP display caveat: existing rows show a hash-derived prefix, not the original raw `orsk-` key prefix.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-046 — Create API Key dialog validation**
  - **Scope:** Secret/integration credentials.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `tauri-windows`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
  - **Scenario overview:** User opens the Create API Key dialog and confirms validation prevents empty submissions and cancel creates no key.
  - **Interaction coverage:**
    - **Controls/actions:** Click Create API Key, edit Description, observe disabled/enabled Create Key, and cancel without submit.
    - **Platform paths:**
      - Web desktop/mobile use API Keys tab → Create API Key dialog; non-web validates tab absence and direct redirect.
      - Mobile web validates dialog fit, keyboard behavior, and disabled submit visibility; non-web validates API Keys tab absence/direct redirect.
    - **Micro-states:**
      - Dialog opens with empty description.
      - Create Key is disabled while description is empty/whitespace.
      - Description input accepts text.
      - Create Key enables when trimmed description is valid.
      - Cancel closes dialog and resets draft on reopen.
    - **Post-state effects:**
      - No API key is created on empty/invalid input.
      - No API key is created on cancel.
      - Existing list remains unchanged.
      - Authenticated session remains active.
    - **Intersections:**
      - Empty description.
      - Whitespace-only description.
      - Valid description draft.
      - Cancel after draft.
      - Mobile web keyboard plus dialog dismissal; non-web tab absence/direct redirect.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - CreateApiKeyDialog manages local description and canSubmit state.
      - Dialog resets draft when opened.
      - API create callback is not called unless submitted with valid description.
    - **Direct effects:**
      - User gets safe client-side validation before key creation.
    - **Downstream effects:**
      - Prevents accidental platform/MCP key creation.
      - Provides setup for SET-047 show-once creation after valid submit.
      - Confirms dialog validation is scoped to web API-key management.
    - **Platform guardrails:**
      - Mobile web dialog controls must remain reachable with keyboard open; non-web direct redirect must remain safe.
      - Non-web API-key absence/redirect should not affect web no-submit validation behavior.
    - **Must-not-change guardrails:**
      - Dialog validation/cancel must not create or revoke keys.
      - Dialog validation/cancel must not expose raw key material.
      - Dialog validation/cancel must not mutate BYOK keys, billing, profile, storage, sync, or preferences.
      - Dialog validation/cancel must not sign the user out.
  - **Preconditions:** Authenticated user on API Keys tab.
  - **Start state:** Create dialog is closed.
  - **Transient states:** Dialog opens; description is empty/invalid/valid.
  - **Terminal states:** Success = Create is disabled until valid description and validates length; Cancel = closing dialog creates no key; Error = empty/invalid description submits.
  - **Screenshot evidence:**
    - `SET-046-start-create-api-key-dialog-validation`
    - Optional: `SET-046-transient-create-api-key-dialog-validation if observable`
    - `SET-046-terminal-create-api-key-dialog-validation`
  - **Assertions/evidence:**
    - Dialog states and no new row after cancel.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-047 — Create API Key show-once result**
  - **Scope:** Secret/integration credentials.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `tauri-windows`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
  - **Scenario overview:** User creates a platform/MCP API key and confirms the raw `orsk-` value appears only in the show-once modal.
  - **Interaction coverage:**
    - **Controls/actions:** Submit Create API Key with valid description, copy/view the show-once key, close modal, and verify only masked row remains.
    - **Platform paths:**
      - Web desktop/mobile use API Keys tab creation against canonical `apps/api` `/api/api-keys`.
      - Tauri desktop and native mobile validate API Keys tab absence and direct `/settings/api-keys` redirect to Account because API-key management is web-only.
    - **Micro-states:**
      - Dialog has valid description.
      - Create submits and enters Creating state.
      - API returns full show-once key and id.
      - Show-once modal displays warning, raw key field, copy button, and MCP config.
      - Modal closes after user confirms saved key.
      - Refreshed list shows only masked/prefix row.
    - **Post-state effects:**
      - Raw key is visible only during the show-once modal.
      - Existing rows never re-expose raw key.
      - New key row appears with description and masked prefix.
      - Redacted key/config evidence is captured.
    - **Intersections:**
      - Successful create on web-backed API.
      - Copy key button success state.
      - Modal close after creation.
      - Non-web API Keys absence/direct redirect.
      - Post-reload raw-key absence.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - useApiKeys createKey posts to `/api/api-keys` and refreshes list.
      - ApiKeyCreatedModal receives full key only from create response.
      - ApiKeyList displays masked key prefix after refresh.
    - **Direct effects:**
      - User creates a new platform/MCP credential.
    - **Downstream effects:**
      - Created key enables MCP config copy and external MCP auth scenarios.
      - New key should appear in list/loading/existing-row scenarios.
      - Revocation scenarios must use disposable keys created by this flow.
    - **Platform guardrails:**
      - Web must preserve show-once semantics and secure copy behavior.
      - Non-web API Keys absence/direct redirect must not be confused with bad validation.
      - Mobile modal must not leak raw key in unredacted screenshots.
    - **Must-not-change guardrails:**
      - Raw key must not be visible after modal close/reload.
      - Creating platform/MCP key must not create BYOK provider keys.
      - Creating key must not mutate billing, profile, storage, sync, or preferences.
      - Creating key must not sign the user out.
  - **Preconditions:** Authenticated user with valid key description.
  - **Start state:** Create dialog has valid description.
  - **Transient states:** Create submits; show-once modal opens with raw `orsk-` key.
  - **Terminal states:** Success = raw key appears only in show-once modal and existing rows show only masked/prefix data; Cancel = closing after creation loses raw view by design; Error = raw key reappears later or modal omits copy guidance.
  - **Screenshot evidence:**
    - `SET-047-start-create-api-key-show-once-result`
    - Optional: `SET-047-transient-create-api-key-show-once-result if observable`
    - `SET-047-terminal-create-api-key-show-once-result`
  - **Assertions/evidence:**
    - Redacted raw key capture, post-close row, and no raw-key re-exposure.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-048 — Copy MCP client config**
  - **Scope:** Secret/integration credentials.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `tauri-windows`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
  - **Scenario overview:** User copies MCP client configuration and confirms the snippet uses the Openread MCP package plus the correct redacted key material.
  - **Interaction coverage:**
    - **Controls/actions:** Select MCP client, inspect config path/snippet, copy config, and expand setup instructions where available.
    - **Platform paths:**
      - Web desktop/mobile use show-once modal or expanded key row config controls.
      - Tauri desktop and native mobile validate API Keys tab absence and direct `/settings/api-keys` redirect to Account because API-key management is web-only.
      - Windows/macOS path copy should reflect detected platform where relevant.
    - **Micro-states:**
      - MCP config panel is visible.
      - Client selector/dropdown changes active client.
      - Config path label updates.
      - Code block includes `npx -y @openread/mcp` and `OPENREAD_API_KEY`.
      - Copy action succeeds and copied payload is redacted in evidence.
      - Optional setup instructions expand/collapse.
    - **Post-state effects:**
      - Clipboard/config evidence contains MCP package command and key placeholder/full show-once key as appropriate.
      - Existing-row config remains masked; show-once config may contain raw key only while modal is open.
      - No API key is created/revoked by copying config.
    - **Intersections:**
      - Show-once modal config with raw key redacted in evidence.
      - Existing-row config with masked prefix.
      - Claude Desktop/Cursor/Claude Code/VS Code/Codex/Gemini/Windsurf client selection.
      - Platform-specific config path copy.
      - Non-web API Keys absence/direct redirect.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - McpConfigTabs formats client config using `@openread/mcp` and key/base URL inputs.
      - mcp-config helpers detect platform and client config paths.
      - Clipboard/copy helper is available.
    - **Direct effects:**
      - User obtains an external-client MCP configuration snippet.
    - **Downstream effects:**
      - Copied config is the setup input for SET-049 external MCP auth/tool success.
      - Config URL/default caveats inform package docs/runtime validation.
      - Redacted config evidence supports secure QA artifacts.
    - **Platform guardrails:**
      - Config path and copy behavior must work for macOS/Windows/browser lanes.
      - Mobile web copy behavior must be captured or classified if clipboard is restricted; non-web validates absence/redirect.
      - Non-web API Keys absence/direct redirect must be recorded when list/config UI is not exposed.
    - **Must-not-change guardrails:**
      - Copying config must not expose raw key outside show-once context.
      - Copying config must not create, revoke, or update keys.
      - Copying config must not mutate BYOK keys, billing, profile, storage, sync, or preferences.
      - Copying config must not sign the user out.
  - **Preconditions:** Newly created key show-once modal or expanded key row is available.
  - **Start state:** MCP config panel is visible.
  - **Transient states:** User selects/copies client config for supported client.
  - **Terminal states:** Success = config includes `npx -y @openread/mcp` and `OPENREAD_API_KEY`; Cancel = no copy leaves UI unchanged; Error = malformed config or wrong API key type.
  - **Screenshot evidence:**
    - `SET-048-start-copy-mcp-client-config`
    - Optional: `SET-048-transient-copy-mcp-client-config if observable`
    - `SET-048-terminal-copy-mcp-client-config`
  - **Assertions/evidence:**
    - Redacted copied config and selected client/path.
    - Known MCP config caveat: advanced `OPENREAD_API_URL` is supported by the package/runtime but is not exposed in the Settings UI config snippets.
    - Known MCP config caveat: package docs/runtime defaults must be checked against the copied API URL.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-049 — External MCP auth and tool success**
  - **Scope:** Secret/integration credentials.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Not required
      - **Status:** Consistent
      - **Reason:** The external MCP auth loop is browser-independent; Safari/WebKit config rendering is covered by API-key UI scenarios.
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Not required
      - **Status:** Consistent
      - **Reason:** External MCP client execution is a desktop/external-client workflow, not an in-app mobile/native workflow.
    - `mobile-web-android`: Not required
      - **Status:** Consistent
      - **Reason:** External MCP client execution is a desktop/external-client workflow, not an in-app mobile/native workflow.
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** External MCP client execution is a desktop/external-client workflow, not an in-app mobile/native workflow.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** External MCP client execution is a desktop/external-client workflow, not an in-app mobile/native workflow.
  - **Scenario overview:** User runs an external MCP client with a disposable `orsk-` key and confirms auth plus at least one library/content tool succeeds.
  - **Interaction coverage:**
    - **Controls/actions:** Start external MCP client/inspector with copied config, authenticate, run `list_books`, and run one content/search/navigation tool.
    - **Platform paths:**
      - Web Chromium and Edge/Windows provide the primary Settings/config evidence lanes.
      - Tauri macOS/Windows are Required for desktop app setup/config-path validation.
      - WebKit and mobile/native are Not required because the external client execution is browser-independent or desktop-only.
    - **Micro-states:**
      - External client is configured with redacted `OPENREAD_API_KEY`.
      - `@openread/mcp` process starts.
      - `/api/mcp/auth` exchanges key for JWT.
      - Book library tool call returns fixture data.
      - Content/search/navigation tool returns expected fixture data.
      - Logs are captured with secrets redacted.
    - **Post-state effects:**
      - External client can access allowed user library data.
      - MCP auth/use evidence is available as text/log artifact.
      - Settings list can later show Last used update.
      - Raw key remains protected in artifacts.
    - **Intersections:**
      - Disposable platform/MCP key.
      - External client package install/start.
      - At least one uploaded/imported book fixture.
      - Auth success plus tool success.
      - Desktop/macOS/Windows config path differences.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Valid disposable platform/MCP key exists.
      - `@openread/mcp` package can run externally.
      - MCP auth endpoint and Supabase/book access are fixture-backed or live.
      - At least one accessible book exists.
    - **Direct effects:**
      - User proves the copied MCP key/config works outside the app.
    - **Downstream effects:**
      - Drives SET-050 Last used feedback.
      - Establishes pre-revoke successful auth baseline for SET-052.
      - Confirms MCP package/runtime can reach user library through current API/JWT flow.
    - **Platform guardrails:**
      - Desktop external-client lanes must record OS/client/config path.
      - Mobile/native skips must remain explicit, not silent.
      - WebKit omission must not reduce config-rendering coverage already handled by UI scenarios.
    - **Must-not-change guardrails:**
      - External MCP tool use must not mutate books unless using a mutating tool, which is out of scope here.
      - External MCP logs must not expose raw key/JWT in artifacts.
      - External MCP success must not bypass revoked-key behavior later.
      - External MCP use must not mutate BYOK keys, billing, profile, storage, sync, or preferences.
  - **Preconditions:** Disposable `orsk-` key, external MCP client/inspector, and at least one uploaded/imported book.
  - **Start state:** External client is not yet authenticated.
  - **Transient states:** Client starts `@openread/mcp`; `/api/mcp/auth` exchanges key; tool call runs.
  - **Terminal states:** Success = auth succeeds and `list_books` plus one content/search/navigation tool returns expected data; Cancel = client stopped before auth/use; Error = auth/tool failure with clear log.
  - **Screenshot evidence:**
    - `SET-049-start-external-mcp-auth-and-tool-success`
    - Optional: `SET-049-transient-external-mcp-auth-and-tool-success if observable`
    - `SET-049-terminal-external-mcp-auth-and-tool-success`
  - **Assertions/evidence:**
    - External MCP logs, redacted env/config, tool result, and book fixture note.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup. External MCP auth/tool use depends on an external client, package install, and API fixture/live service; classify failures before changing code or docs.
- [ ] **SET-050 — MCP `Last used` feedback**
  - **Scope:** Secret/integration credentials.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `tauri-windows`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
  - **Scenario overview:** User refreshes the API-key list after external MCP use and confirms `Last used` changes from never/stale to recent.
  - **Interaction coverage:**
    - **Controls/actions:** Use a disposable key externally, reopen/refresh API Keys, and compare the target row's Last used value.
    - **Platform paths:**
      - Web desktop/mobile read the API Keys row after external MCP use.
      - Tauri desktop and native mobile validate API Keys tab absence and direct `/settings/api-keys` redirect to Account because API-key management is web-only.
    - **Micro-states:**
      - Row starts with Never used or stale Last used.
      - External MCP auth/tool succeeds.
      - Settings list is reopened/refetched.
      - Target row renders a recent Last used value.
      - Timestamp/log evidence is attached.
    - **Post-state effects:**
      - Last used value reflects fresh MCP auth/use.
      - Key description and masked prefix remain unchanged.
      - Raw key is not re-exposed.
      - External MCP use remains auditable through redacted logs.
    - **Intersections:**
      - Never-used key to recent Last used.
      - Stale Last used to recent Last used.
      - External MCP auth/tool success prerequisite.
      - Non-web API Keys absence/direct redirect.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - External MCP flow updates `last_used_at` server-side.
      - useApiKeys refetches key list.
      - ApiKeyList formats relative Last used time.
    - **Direct effects:**
      - User can verify recent MCP usage from Settings.
    - **Downstream effects:**
      - Provides audit evidence before revoke testing.
      - Confirms MCP auth/tool use produces visible Settings feedback.
      - Helps classify external MCP success versus Settings list refresh failures.
    - **Platform guardrails:**
      - Web list refresh must show updated row without exposing raw key.
      - Non-web API Keys absence/direct redirect must be documented if list cannot refresh because UI is not exposed.
      - Mobile row wrapping must keep Last used readable.
    - **Must-not-change guardrails:**
      - Last used refresh must not create, revoke, or reveal keys.
      - Last used refresh must not mutate BYOK keys, billing, profile, storage, sync, or preferences.
      - Last used refresh must not sign the user out.
      - Failed refresh must not falsely show stale data as fresh.
  - **Preconditions:** Disposable key has just been used by external MCP auth/tool flow.
  - **Start state:** Settings API Keys page may show stale row.
  - **Transient states:** User refreshes/reopens list after MCP use.
  - **Terminal states:** Success = `Last used` changes from Never/stale to recent value; Cancel = not applicable; Error = successful MCP use does not update row.
  - **Screenshot evidence:**
    - `SET-050-start-mcp-last-used-feedback`
    - Optional: `SET-050-transient-mcp-last-used-feedback if observable`
    - `SET-050-terminal-mcp-last-used-feedback`
  - **Assertions/evidence:**
    - Before/after row and MCP auth/use timestamp/log.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-051 — Revoke API Key cancel**
  - **Scope:** Secret/integration credentials.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `tauri-windows`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
  - **Scenario overview:** User opens Revoke API Key and cancels, confirming the key row remains and the key still works for fresh auth.
  - **Interaction coverage:**
    - **Controls/actions:** Expand an existing key row, click Revoke Key, inspect confirmation, then cancel.
    - **Platform paths:**
      - Web desktop/mobile use API Keys row expansion and Revoke Key dialog.
      - Tauri desktop and native mobile validate API Keys tab absence and direct `/settings/api-keys` redirect to Account because API-key management is web-only.
    - **Micro-states:**
      - Existing key row is visible.
      - Row is expanded if needed.
      - Revoke confirmation dialog opens.
      - Destructive warning copy is visible.
      - Cancel/dismiss closes the dialog.
      - Row remains visible and unchanged.
    - **Post-state effects:**
      - Key remains active after cancel.
      - Optional fresh MCP auth still succeeds with the key.
      - Raw key is not re-exposed.
      - No success/revoked state is shown.
    - **Intersections:**
      - Cancel via dialog button.
      - Dismiss/back/escape where supported.
      - Fresh MCP auth after cancel.
      - Non-web API Keys absence/direct redirect.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - ApiKeyList can expand rows and open RevokeKeyDialog.
      - Cancel closes dialog without calling revoke callback.
      - Optional external MCP fixture can prove key still authenticates.
    - **Direct effects:**
      - User safely abandons platform/MCP key revocation.
    - **Downstream effects:**
      - Preserves disposable key fixture for SET-052 revoke success.
      - Confirms destructive dialog cancel semantics for API keys.
      - Protects MCP access from accidental revocation.
    - **Platform guardrails:**
      - Mobile web dialog cancel must remain reachable; non-web validates absence/redirect.
      - Non-web API Keys absence/direct redirect must be documented if row/dialog cannot load because UI is not exposed.
    - **Must-not-change guardrails:**
      - Cancel must not revoke or disable the key.
      - Cancel must not change Last used, description, or masked prefix.
      - Cancel must not mutate BYOK keys, billing, profile, storage, sync, or preferences.
      - Cancel must not sign the user out.
  - **Preconditions:** Existing platform/MCP key row is visible.
  - **Start state:** Revoke dialog can be opened.
  - **Transient states:** Revoke confirmation opens and user cancels.
  - **Terminal states:** Success = not applicable; Cancel = key row remains and still authenticates; Error = cancel deletes or disables key.
  - **Screenshot evidence:**
    - `SET-051-start-revoke-api-key-cancel`
    - Optional: `SET-051-transient-revoke-api-key-cancel if observable`
    - `SET-051-terminal-revoke-api-key-cancel`
  - **Assertions/evidence:**
    - Row remains after cancel and optional fresh MCP auth still succeeds.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-052 — Revoke API Key success and fresh-auth failure**
  - **Scope:** Secret/integration credentials.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `tauri-windows`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
  - **Scenario overview:** User revokes a disposable platform/MCP API key and confirms the row/list updates plus fresh MCP auth fails.
  - **Interaction coverage:**
    - **Controls/actions:** Open Revoke Key, confirm revocation, refresh/list-check, then start a fresh MCP auth attempt with the revoked key.
    - **Platform paths:**
      - Web desktop/mobile use API Keys row revoke flow plus external MCP proof.
      - Tauri desktop and native mobile validate API Keys tab absence and direct `/settings/api-keys` redirect to Account because API-key management is web-only.
    - **Micro-states:**
      - Disposable key row is visible before revoke.
      - Revoke confirmation dialog opens.
      - Confirm enters Revoking state.
      - Row is removed or list refresh proves it is gone/disabled.
      - Fresh external MCP auth with revoked raw key fails.
    - **Post-state effects:**
      - Revoked key cannot freshly authenticate.
      - Other keys remain visible/usable.
      - Existing one-hour MCP JWT behavior is documented separately.
      - Raw key is not re-exposed during revoke.
    - **Intersections:**
      - Successful revoke request.
      - Post-revoke list refresh.
      - Fresh MCP auth failure.
      - Existing JWT expiry caveat.
      - Non-web API Keys absence/direct redirect.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Disposable key exists and raw value is available only from secure test fixture.
      - useApiKeys revokeKey deletes `/api/api-keys/[id]` and updates local list.
      - MCP auth endpoint validates revoked key as invalid for fresh auth.
    - **Direct effects:**
      - User revokes platform/MCP access for the selected key.
    - **Downstream effects:**
      - External MCP clients using that key fail fresh auth.
      - Settings key inventory no longer shows the revoked key.
      - Security/audit validation confirms revocation blast radius.
    - **Platform guardrails:**
      - Web revoke flow must prove row/list and fresh auth outcomes, not just a generic success toast.
      - Non-web API Keys absence/direct redirect must be documented if revoke UI is not exposed.
      - Mobile dialog confirm must remain reachable and redacted artifacts must protect raw key.
    - **Must-not-change guardrails:**
      - Revoking one key must not revoke other keys.
      - Revoking platform/MCP key must not remove BYOK provider keys.
      - Revoking must not mutate billing, profile, storage, sync, preferences, or books.
      - Revoking must not sign the user out.
  - **Preconditions:** Existing disposable key row and external MCP client available.
  - **Start state:** Revoke dialog is open for the disposable key.
  - **Transient states:** Confirm revoke submits; list refreshes; fresh MCP process starts with revoked raw key.
  - **Terminal states:** Success = row is removed/disabled and fresh MCP auth fails; Cancel = not applicable after confirm; Error = revoked key can freshly authenticate.
  - **Screenshot evidence:**
    - `SET-052-start-revoke-api-key-success-and-fresh-auth-failure`
    - Optional: `SET-052-transient-revoke-api-key-success-and-fresh-auth-failure if observable`
    - `SET-052-terminal-revoke-api-key-success-and-fresh-auth-failure`
  - **Assertions/evidence:**
    - Revoke confirmation, post-revoke list, fresh-auth failure log, and note that existing one-hour JWT behavior is separate.
    - Known MCP security caveat: revoked keys should fail fresh auth, but already-issued MCP JWTs can continue until their one-hour expiry.
    - Known MCP UX caveat: revoke success should be backed by post-revoke list/auth evidence because a generic success response alone does not prove a row was deleted.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-053 — API key create/revoke error**
  - **Scope:** Secret/integration credentials.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `tauri-windows`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** API-key management is web-only; non-web Settings hides the API Keys tab and redirects direct `/settings/api-keys` access to Account.
  - **Scenario overview:** User hits a platform/MCP API-key create or revoke failure and confirms visible error feedback with an unchanged key list.
  - **Interaction coverage:**
    - **Controls/actions:** Submit Create API Key or confirm Revoke Key under forced API failure, then verify list recovery.
    - **Platform paths:**
      - Web desktop/mobile use API Keys tab create/revoke controls; non-web validates API Keys tab absence/direct redirect.
      - Non-web static builds do not expose API-key management; direct route attempts should redirect to Account rather than exercising CRUD errors.
    - **Micro-states:**
      - Create or revoke action is ready.
      - Request enters Creating/Revoking state.
      - API failure returns or request fails.
      - Error toast/copy appears, possibly generic.
      - Dialog/list recovers without false success.
    - **Post-state effects:**
      - Create failure does not add a row.
      - Revoke failure leaves the row active/visible.
      - User can retry or dismiss safely.
      - Raw key is not exposed.
    - **Intersections:**
      - Create API failure.
      - Revoke API failure.
      - Generic error copy.
      - Non-web API Keys absence/direct redirect.
      - Mobile dialog recovery.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - useApiKeys createKey/revokeKey surfaces failure through toast/error handling.
      - API failure fixture can force non-ok responses or network failure.
      - Key list state can be compared before and after.
    - **Direct effects:**
      - User sees failure feedback without key inventory corruption.
    - **Downstream effects:**
      - Prevents tests from treating failed create/revoke as successful credential changes.
      - Provides error-path evidence for known generic error copy caveat.
      - Helps classify non-web API Keys absence/direct redirect separately from web regressions.
    - **Platform guardrails:**
      - Mobile web errors must remain visible and controls recoverable; non-web validates absence/redirect.
      - Non-web API Keys absence/direct redirect must be recorded with platform context.
    - **Must-not-change guardrails:**
      - Create failure must not create a usable key.
      - Revoke failure must not delete/disable the key.
      - Error handling must not mutate BYOK keys, billing, profile, storage, sync, or preferences.
      - Error handling must not sign the user out.
  - **Preconditions:** Authenticated user with forced API failure fixture.
  - **Start state:** Create or revoke action is ready.
  - **Transient states:** Request submits and API fails.
  - **Terminal states:** Success = not applicable for failure fixture; Cancel = user can dismiss/retry safely; Error = visible failure copy and list remains accurate.
  - **Screenshot evidence:**
    - `SET-053-start-api-key-create-revoke-error`
    - Optional: `SET-053-transient-api-key-create-revoke-error if observable`
    - `SET-053-terminal-api-key-create-revoke-error`
  - **Assertions/evidence:**
    - Error copy/log and unchanged key list state.
    - Known MCP UX caveat: create/revoke failures may surface generic error copy, so capture both user-visible copy and unchanged list state.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-054 — Billing loading and error states**
  - **Scope:** Entitlement/billing/quota.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User opens Billing under slow/error billing fixtures and confirms loading or error states are understandable and non-destructive.
  - **Interaction coverage:**
    - **Controls/actions:** Open Billing tab with delayed or failed subscription/plans/invoices data.
    - **Platform paths:**
      - All required Settings platforms use `/settings/billing` or Settings tab navigation.
      - Mobile/native platforms validate stacked cards, scrollability, and error copy visibility.
    - **Micro-states:**
      - Billing tab route starts loading.
      - Plan/subscription/invoice requests are pending.
      - Skeleton/loading states render where components support them.
      - Error state renders with contact/support copy when subscription hook errors.
      - User can navigate away safely.
    - **Post-state effects:**
      - Loading resolves to Free/paid billing view or clear error state.
      - Error state does not imply plan change.
      - No checkout/portal/cancel action starts automatically.
      - Authenticated session remains active.
    - **Intersections:**
      - Slow subscription/plans fixture.
      - Invoice fetch failure that is non-critical.
      - Subscription hook error state.
      - Mobile/native billing route scroll behavior.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - useSubscription exposes loading/error/subscription/plans/invoices.
      - BillingPage renders Free, paid, loading, and error branches.
      - Billing services or fixtures can delay/fail requests.
    - **Direct effects:**
      - User sees billing status feedback instead of a blank or contradictory page.
    - **Downstream effects:**
      - Establishes loading/error classification before Free, paid, checkout, portal, cancellation, and invoice scenarios.
      - Prevents billing service failures from being mistaken for Settings route failures.
      - Provides evidence for known billing wiring caveats.
    - **Platform guardrails:**
      - Mobile/native billing states must remain scrollable and readable.
      - Tauri/native external-service failures must leave the Settings shell usable.
    - **Must-not-change guardrails:**
      - Loading/error states must not mutate plan, subscription, storage add-ons, API keys, BYOK keys, profile, sync, or preferences.
      - Loading/error states must not sign the user out.
      - Loading/error states must not show false paid/free transitions.
      - Loading/error states must not start external handoffs.
  - **Preconditions:** Authenticated user with slow/error billing fixture.
  - **Start state:** Billing tab is opening.
  - **Transient states:** Subscription/plans/quota/invoice requests load or fail.
  - **Terminal states:** Success = loading resolves to Free/paid view or clear error state; Cancel = navigating away is safe; Error = blank or contradictory billing state.
  - **Screenshot evidence:**
    - `SET-054-start-billing-loading-and-error-states`
    - Optional: `SET-054-transient-billing-loading-and-error-states if observable`
    - `SET-054-terminal-billing-loading-and-error-states`
  - **Assertions/evidence:**
    - Loading/error captures and retry/contact-support copy.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-055 — Free billing view and upgrade path**
  - **Scope:** Entitlement/billing/quota.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** Free user views Billing and confirms Free-plan copy, plan cards, and upgrade path are clear without exposing paid-only management controls.
  - **Interaction coverage:**
    - **Controls/actions:** Open Billing as Free user, inspect Free-plan card, Available Plans, and optional Upgrade/plan-selection CTA.
    - **Platform paths:**
      - All required Settings platforms use Billing tab Free view.
      - Mobile/native platforms validate plan-card stacking, upgrade CTA, and external checkout handoff affordance.
    - **Micro-states:**
      - Billing data resolves with no paid subscription or Free plan.
      - Free-plan summary card renders.
      - Upgrade anchor scrolls/links to Available Plans.
      - Plan cards render with current Free state and paid CTAs.
      - Selecting eligible paid plan starts checkout or shows product/checkout error.
    - **Post-state effects:**
      - User understands Free plan status and upgrade options.
      - Paid-only Manage Plan/Cancel controls are absent.
      - MCP upgrade copy caveat is recorded separately from actual API-key gating.
      - No plan changes until checkout completes externally.
    - **Intersections:**
      - Free/no-subscription fixture.
      - Available Plans loading/resolved.
      - Upgrade anchor behavior.
      - Checkout handoff/error when CTA is activated.
      - Mobile/narrow plan-card layout.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - useSubscription identifies Free/no-subscription state.
      - PlanCards render fallback plan config and available plan details.
      - Stripe checkout fixture exists for actual upgrade handoff.
    - **Direct effects:**
      - User sees current Free status and possible upgrade choices.
    - **Downstream effects:**
      - Provides starting state for SET-057 Stripe checkout.
      - Informs BYOK/storage/MCP entitlement expectations.
      - Documents mismatch where billing copy implies MCP is upgrade-gated while API-key creation is not plan-gated.
    - **Platform guardrails:**
      - Plan cards and upgrade CTA must remain readable/tappable on mobile/native.
      - Tauri/native external checkout handoff must be classified if launched.
    - **Must-not-change guardrails:**
      - Viewing Free billing must not change plan or start checkout automatically.
      - Upgrade path cancel/error must not create paid subscription.
      - Free billing view must not mutate API keys, BYOK keys, profile, storage, sync, or preferences.
      - Free billing view must not sign the user out.
  - **Preconditions:** Free/no-subscription user.
  - **Start state:** Billing data has loaded.
  - **Transient states:** Free plan surface and Available Plans render; upgrade CTA can be activated.
  - **Terminal states:** Success = Free copy, Available Plans, and upgrade anchor/handoff are clear; Cancel = user does not start checkout; Error = paid-only management controls appear incorrectly.
  - **Screenshot evidence:**
    - `SET-055-start-free-billing-view-and-upgrade-path`
    - Optional: `SET-055-transient-free-billing-view-and-upgrade-path if observable`
    - `SET-055-terminal-free-billing-view-and-upgrade-path`
  - **Assertions/evidence:**
    - Free billing screenshot, plan cards, and upgrade CTA target.
    - Known billing/MCP copy caveat: upgrade copy can imply MCP is gated, while API-key creation is currently not plan-gated.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup. Upgrade/checkout paths depend on Stripe or billing fixtures; classify service failures before changing code or docs.
- [ ] **SET-056 — Paid billing view**
  - **Scope:** Entitlement/billing/quota.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** Paid user views Billing and confirms current plan, usage, payment, invoice, and plan-comparison surfaces render coherently from current wiring.
  - **Interaction coverage:**
    - **Controls/actions:** Open Billing as paid user and inspect usage meters, Current Plan, Manage Plan, Cancel, Payment Method, Invoices, and Available Plans.
    - **Platform paths:**
      - All required Settings platforms use Billing tab paid view.
      - Mobile/native platforms validate stacked usage cards, payment/invoice cards, and action controls.
    - **Micro-states:**
      - Billing data resolves with paid subscription from `userProfilePlan`.
      - AI/storage/MCP usage cards render.
      - Current Plan card renders status and Manage Plan/Cancel controls.
      - Payment Method card renders empty or provided state.
      - InvoiceList renders empty/list state.
      - Available Plans render with current-plan state.
    - **Post-state effects:**
      - Paid billing surface is understandable with current placeholder-derived data.
      - No portal/checkout/cancel action starts merely by viewing.
      - Known wiring caveats are captured with evidence.
    - **Intersections:**
      - Reader/Pro paid plan fixture.
      - Empty payment method prop.
      - Empty usage history data.
      - Default MCP usage display.
      - Invoice fetch success/empty/failure.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - useSubscription builds subscription from `userProfilePlan` and available plans.
      - Billing components render usage/current plan/payment/invoice/plan cards.
      - Invoice fetch may be missing/failing without breaking paid view.
    - **Direct effects:**
      - User can inspect paid billing status and management entry points.
    - **Downstream effects:**
      - Provides starting state for portal/manage-plan and cancellation scenarios.
      - Exposes billing wiring gaps that affect payment/invoice/usage assertions.
      - Supports entitlement expectations for BYOK, storage, and MCP copy.
    - **Platform guardrails:**
      - Paid billing cards must remain scrollable on mobile/native.
      - Tauri/native shell must not hide Manage Plan/Cancel controls.
    - **Must-not-change guardrails:**
      - Viewing paid billing must not change plan, cancel subscription, or start portal automatically.
      - Paid billing view must not mutate API keys, BYOK keys, profile, storage, sync, or preferences.
      - Paid billing view must not sign the user out.
      - Placeholder/empty data must not be asserted as live billing truth without fixture evidence.
  - **Preconditions:** Paid subscription fixture.
  - **Start state:** Billing data has loaded.
  - **Transient states:** Usage/current-plan/payment/invoice/plan-comparison surfaces render.
  - **Terminal states:** Success = paid surfaces render coherently from available data; Cancel = not applicable; Error = missing payment/invoice/usage state lacks clear empty/error copy.
  - **Screenshot evidence:**
    - `SET-056-start-paid-billing-view`
    - Optional: `SET-056-transient-paid-billing-view if observable`
    - `SET-056-terminal-paid-billing-view`
  - **Assertions/evidence:**
    - Current plan, usage meters, payment method, invoice state, and plan comparison capture.
    - Known billing wiring caveat: paid billing is partly placeholder-derived, including plan from `userProfilePlan`, no payment method prop, empty usage history data, and default MCP usage.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-057 — Stripe checkout handoff**
  - **Scope:** Entitlement/billing/quota.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User starts a Stripe checkout from Billing and confirms the external handoff, cancel/return, and error states are explicit.
  - **Interaction coverage:**
    - **Controls/actions:** Click an eligible paid-plan CTA and observe checkout session creation plus redirect/handoff.
    - **Platform paths:**
      - Web platforms validate browser popup/redirect/download-like handoff behavior.
      - Tauri desktop validates embedded/external browser handoff and return/cancel state.
      - Mobile/native platforms validate mobile browser/app-store handoff classification where applicable.
    - **Micro-states:**
      - Eligible plan CTA is visible and enabled.
      - User selects plan.
      - Plan card enters Processing state.
      - Checkout session request starts.
      - Stripe URL/window/handoff opens, or failure toast appears.
      - Return/cancel state is captured if fixture supports it.
    - **Post-state effects:**
      - Successful handoff is explicit to the user.
      - Checkout cancel/return does not change plan.
      - Checkout failure surfaces error copy.
      - Billing page remains recoverable.
    - **Intersections:**
      - Free-to-paid upgrade.
      - Paid plan switch where applicable.
      - Monthly/annual billing cycle selection.
      - Stripe success/cancel/error fixtures.
      - Web/Tauri/native external handoff differences.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - PlanCards can call upgradeToPlan with product/price id.
      - Stripe checkout session helper and redirect helper are live or fixture-backed.
      - Billing fixture provides eligible plan products.
    - **Direct effects:**
      - User leaves or is handed off to Stripe checkout for plan purchase/change.
    - **Downstream effects:**
      - Successful checkout should later affect subscription/entitlement billing views.
      - Cancel/error paths must leave Free/paid billing baseline unchanged.
      - Provides external dependency classification for billing tests.
    - **Platform guardrails:**
      - WebKit/Edge popup or redirect behavior must be captured per lane.
      - Tauri/native external browser handoff must be explicit and recoverable.
      - Mobile/native handoff failures must be classified separately from Settings UI failures.
    - **Must-not-change guardrails:**
      - Starting checkout must not change plan until checkout completion is confirmed.
      - Checkout cancel/error must not mutate account, API keys, BYOK keys, profile, storage, sync, or preferences.
      - Checkout handoff must not sign the user out.
      - Checkout evidence must not expose payment secrets.
  - **Preconditions:** Eligible user and Stripe checkout fixture.
  - **Start state:** Upgrade/select plan action is available.
  - **Transient states:** Checkout request starts and external Stripe/browser handoff begins.
  - **Terminal states:** Success = handoff URL/window is explicit and return state is understandable; Cancel = checkout canceled/returned without plan change; Error = checkout failure copy appears.
  - **Screenshot evidence:**
    - `SET-057-start-stripe-checkout-handoff`
    - Optional: `SET-057-transient-stripe-checkout-handoff if observable`
    - `SET-057-terminal-stripe-checkout-handoff`
  - **Assertions/evidence:**
    - Checkout request/log, external handoff, return/cancel/error state.
    - Known external dependency: Stripe checkout handoff requires a live or fixture-backed billing service; classify handoff failures before changing code or docs.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-058 — Billing portal/manage-plan handoff**
  - **Scope:** Entitlement/billing/quota.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** Paid user opens Manage Plan and confirms the Stripe billing portal handoff, return, and failure behavior are explicit.
  - **Interaction coverage:**
    - **Controls/actions:** Click Manage Plan from Current Plan and observe portal session creation plus external handoff.
    - **Platform paths:**
      - Web platforms validate browser portal popup/redirect behavior.
      - Tauri desktop validates external browser/portal handoff and return/cancel state.
      - Mobile/native platforms validate external portal handoff or platform-store management classification.
    - **Micro-states:**
      - Paid Current Plan card is visible.
      - Manage Plan action is enabled.
      - Portal request starts.
      - Stripe portal URL/window/handoff opens, or failure toast appears.
      - User returns without changes where fixture supports return.
    - **Post-state effects:**
      - User gets explicit management handoff for billing changes.
      - Returning/canceling portal leaves subscription unchanged unless fixture applies changes.
      - Portal failure surfaces visible error copy.
      - Billing page remains recoverable.
    - **Intersections:**
      - Paid Stripe subscription fixture.
      - Portal success handoff.
      - Portal cancel/return.
      - Portal failure fixture.
      - App-store-source subscription handoff classification.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - CurrentPlanCard exposes Manage Plan for paid subscriptions.
      - Billing portal service creates a Stripe portal session or fixture response.
      - External open/redirect helper handles browser/Tauri/native handoff.
    - **Direct effects:**
      - User leaves or is handed off to billing portal for subscription management.
    - **Downstream effects:**
      - Portal-made changes should later be reflected in paid/free billing views after refresh.
      - Portal cancel/error must preserve current subscription state.
      - App-store-source subscriptions should be treated as platform handoff, not web portal mutation.
    - **Platform guardrails:**
      - Web popup/redirect blockers must be captured as lane-specific behavior.
      - Tauri/native handoff must not strand the Settings page.
      - Mobile/native portal or store-management handoff must be classified distinctly.
    - **Must-not-change guardrails:**
      - Opening portal must not change subscription before external completion.
      - Portal cancel/error must not mutate API keys, BYOK keys, profile, storage, sync, or preferences.
      - Portal handoff must not sign the user out.
      - Portal evidence must not expose payment secrets.
  - **Preconditions:** Paid subscription fixture with portal access.
  - **Start state:** Manage Plan action is available.
  - **Transient states:** Portal request starts and external Stripe portal handoff begins.
  - **Terminal states:** Success = portal handoff is explicit; Cancel = user returns without changes; Error = portal failure copy appears.
  - **Screenshot evidence:**
    - `SET-058-start-billing-portal-manage-plan-handoff`
    - Optional: `SET-058-transient-billing-portal-manage-plan-handoff if observable`
    - `SET-058-terminal-billing-portal-manage-plan-handoff`
  - **Assertions/evidence:**
    - Portal request/log, external handoff, and return/error state.
    - Known external dependency: Stripe portal handoff requires a live or fixture-backed billing service; classify handoff failures before changing code or docs.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-059 — Subscription cancellation flow**
  - **Scope:** Entitlement/billing/quota.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** Paid user opens cancellation, moves through retention/survey/confirmation or exits safely, and confirms Stripe versus app-store-source behavior is classified.
  - **Interaction coverage:**
    - **Controls/actions:** Click Cancel, choose keep/retention or proceed, complete/skip survey, and confirm final state.
    - **Platform paths:**
      - Web/Tauri Stripe lanes validate in-app retention offer, survey, cancel request, and confirmation.
      - Native/app-store-source lanes validate pre-cancel prompt plus Apple/Google subscription-management handoff where applicable.
      - Mobile layouts validate dialog fit, keyboard entry in survey, and close affordances.
    - **Micro-states:**
      - Cancel dialog opens from Current Plan.
      - Retention offer or pre-cancel prompt renders.
      - Keep/close exits without cancellation.
      - Proceed moves to survey.
      - Submit/skip survey enters submitting state.
      - Stripe cancel or app-store deep link/handoff runs.
      - Confirmation or error toast appears.
    - **Post-state effects:**
      - Keep/close leaves subscription active.
      - Stripe success records cancel-at-period-end/confirmation expectations.
      - App Store / Google Play path is treated as external handoff, not in-app cancellation proof.
      - Failure shows error without false cancellation.
    - **Intersections:**
      - Stripe paid fixture.
      - Apple/Google provider fixture if available.
      - Retention discount keep action.
      - Survey submit and skip.
      - Cancellation API success/failure.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - CurrentPlanCard opens CancelSubscriptionDialog.
      - CancellationFlow controls retention, survey, and confirmation steps.
      - Stripe cancel and retention coupon APIs are live or fixture-backed.
      - App-store-source paths use external subscription-management deep links.
    - **Direct effects:**
      - User either keeps subscription, requests Stripe cancellation, or is handed off to platform subscription management.
    - **Downstream effects:**
      - Successful Stripe cancellation should affect subsequent Billing current-plan status/period-end copy.
      - Retention keep path should preserve paid billing view.
      - App-store handoff requires separate platform billing proof outside the web app.
    - **Platform guardrails:**
      - Mobile/native cancellation dialog must remain usable with survey input and external handoff.
      - Tauri/native external-link behavior must not strand the user.
      - Platform-store subscriptions must not be asserted as canceled solely from Openread confirmation copy.
    - **Must-not-change guardrails:**
      - Exiting cancellation must not cancel or downgrade subscription.
      - Cancellation failure must not show false canceled state.
      - Cancellation flow must not mutate API keys, BYOK keys, profile, storage, sync, or preferences.
      - Cancellation flow must not sign the user out.
  - **Preconditions:** Fixture paid account safe for cancellation.
  - **Start state:** Cancellation entry point is available.
  - **Transient states:** Cancellation prompt/survey/confirmation flow runs.
  - **Terminal states:** Success = canceled/retained terminal state is clear; Cancel = user exits and subscription remains active; Error = failure copy appears without false cancellation.
  - **Screenshot evidence:**
    - `SET-059-start-subscription-cancellation-flow`
    - Optional: `SET-059-transient-subscription-cancellation-flow if observable`
    - `SET-059-terminal-subscription-cancellation-flow`
  - **Assertions/evidence:**
    - Cancellation screenshots/logs, final subscription state, and app-store-source note where applicable.
    - Known cancellation caveat: App Store / Google Play subscription cancellation remains outside web-app control and should be verified as a platform handoff, not an in-app cancellation.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup. Cancellation depends on Stripe, app-store, or fixture-backed billing services; classify service failures before changing code or docs.
- [ ] **SET-060 — Billing invoice/payment empty states**
  - **Scope:** Entitlement/billing/quota.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User views Billing with missing invoice/payment data and confirms empty states are understandable, non-blocking, and do not leak undefined data.
  - **Interaction coverage:**
    - **Controls/actions:** Open Billing with invoice/payment data absent or failed and inspect Payment Method and InvoiceList cards.
    - **Platform paths:**
      - All required Settings platforms use Billing tab payment/invoice surfaces.
      - Mobile/native platforms validate empty-state cards remain readable in stacked layout.
    - **Micro-states:**
      - Billing data resolves without payment method prop.
      - Payment Method renders missing/empty state.
      - InvoiceList receives empty list or failed fetch result.
      - Billing page remains usable with other cards visible.
      - Console/API evidence is captured for missing invoice route if observed.
    - **Post-state effects:**
      - User sees non-blocking payment/invoice empty-state copy.
      - Undefined/null implementation details are not visible.
      - Billing management/upgrade actions remain independently testable.
      - No billing mutation occurs.
    - **Intersections:**
      - Free fixture with no invoices/payment.
      - Paid fixture with missing payment method.
      - Missing/failing invoices route.
      - Empty usage/history data.
      - Mobile/narrow empty-state layout.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - BillingPage passes payment/invoice data into PaymentMethod and InvoiceList.
      - Current wiring may omit payment method data.
      - Invoice fetch route may be absent from current Next/API tree.
    - **Direct effects:**
      - User can understand unavailable payment/invoice data without blocking other billing actions.
    - **Downstream effects:**
      - Prevents paid billing tests from failing solely due to expected empty payment/invoice wiring.
      - Provides evidence for billing backend/API gaps.
      - Separates empty states from checkout/portal/cancellation behavior.
    - **Platform guardrails:**
      - Empty-state cards must not collapse or hide adjacent billing controls on mobile/native.
      - Tauri/native missing-route errors must be classified as data/API wiring, not shell failure.
    - **Must-not-change guardrails:**
      - Empty invoice/payment states must not change plan or subscription.
      - Empty invoice/payment states must not start checkout, portal, or cancellation.
      - Empty invoice/payment states must not mutate API keys, BYOK keys, profile, storage, sync, or preferences.
      - Empty invoice/payment states must not sign the user out.
  - **Preconditions:** Free or paid fixture with missing invoice/payment method data.
  - **Start state:** Billing data has loaded.
  - **Transient states:** Invoice/payment components render without data.
  - **Terminal states:** Success = empty states are understandable and non-blocking; Cancel = not applicable; Error = broken fetch or undefined data appears to user.
  - **Screenshot evidence:**
    - `SET-060-start-billing-invoice-payment-empty-states`
    - Optional: `SET-060-transient-billing-invoice-payment-empty-states if observable`
    - `SET-060-terminal-billing-invoice-payment-empty-states`
  - **Assertions/evidence:**
    - Invoice/payment empty-state copy and console/API notes if relevant.
    - Known billing wiring caveat: invoices fetch from a route not found in the current Next/API tree, and payment method data is not currently passed into the Billing page.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-061 — Reader desktop Settings dialog open/close**
  - **Scope:** Global Reader defaults and per-book Reader settings.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
    - `mobile-web-android`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
  - **Scenario overview:** Desktop Reader user opens and closes the Settings dialog for the active book and confirms no unintended Reader-setting changes occur.
  - **Interaction coverage:**
    - **Controls/actions:** Open Reader Settings through Font & Layout/SettingsToggler or View Menu, then close with close button/backdrop/escape where supported.
    - **Platform paths:**
      - Desktop web and Tauri lanes use Reader desktop dialog controls.
      - Mobile web/native are Not required because SET-062 covers the mobile/native sheet.
    - **Micro-states:**
      - Reader content is loaded and stable.
      - Settings dialog is closed.
      - Opening sets the active dialog book key.
      - Dialog renders current/last panel with tabs and menu controls.
      - Close/dismiss hides the dialog and returns focus/context to Reader.
    - **Post-state effects:**
      - Active book remains the same.
      - Reader content remains readable.
      - No settings values change from open/close alone.
      - Last active panel may persist only if a panel is selected.
    - **Intersections:**
      - SettingsToggler entry.
      - View Menu entry.
      - Close icon/backdrop/escape behavior where supported.
      - Multiple open books or active book key check.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - SettingsToggler and ViewMenu set `settingsDialogBookKey` and `isSettingsDialogOpen`.
      - ReaderContent mounts SettingsDialog for `settingsDialogBookKey`.
      - SettingsDialog initializes active panel from `lastConfigPanel` or Font.
    - **Direct effects:**
      - User can access per-book/global Reader settings from desktop Reader.
    - **Downstream effects:**
      - Establishes desktop shell prerequisite for panel switching, scope, reset, CSS, and persistence scenarios.
      - Confirms dialog close does not affect reading position or active book context.
      - Provides baseline for mobile/native sheet comparison.
    - **Platform guardrails:**
      - Desktop dialog must remain usable across Chromium/WebKit/Edge/Tauri window sizes.
      - Tauri titlebar/shell controls must not overlap dialog close/menu controls.
    - **Must-not-change guardrails:**
      - Opening/closing the dialog must not mutate font, layout, color, control, language, custom CSS, profile, billing, API keys, BYOK keys, storage, sync, or library data.
      - Opening/closing must not sign the user out.
      - Opening/closing must not switch active book or reading position.
  - **Preconditions:** Desktop Reader with a book loaded.
  - **Start state:** Reader content is stable and settings dialog is closed.
  - **Transient states:** Header/View Menu opens SettingsDialog; close action runs.
  - **Terminal states:** Success = dialog opens for active book and closes without unintended setting changes; Cancel = close leaves prior settings unchanged; Error = wrong book key or stuck dialog.
  - **Screenshot evidence:**
    - `SET-061-start-reader-desktop-settings-dialog-open-close`
    - Optional: `SET-061-transient-reader-desktop-settings-dialog-open-close if observable`
    - `SET-061-terminal-reader-desktop-settings-dialog-open-close`
  - **Assertions/evidence:**
    - Open/close captures and active book key/scope note.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-062 — Reader mobile/native Settings sheet**
  - **Scope:** Global Reader defaults and per-book Reader settings.
  - **Platforms:**
    - `web-chromium`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the mobile/native Reader settings sheet; desktop dialog behavior is covered separately.
    - `web-webkit`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the mobile/native Reader settings sheet; desktop dialog behavior is covered separately.
    - `web-edge-windows`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the mobile/native Reader settings sheet; desktop dialog behavior is covered separately.
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the mobile/native Reader settings sheet; desktop dialog behavior is covered separately.
    - `tauri-windows`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the mobile/native Reader settings sheet; desktop dialog behavior is covered separately.
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** Mobile/native Reader user opens the Settings half-sheet, adjusts or inspects compact controls, and dismisses it without navigation traps.
  - **Interaction coverage:**
    - **Controls/actions:** Tap mobile footer/native Settings control, inspect compact settings, optionally adjust one safe control, then dismiss/toggle close.
    - **Platform paths:**
      - Mobile web and Android use the web footer Settings button with HalfSheet.
      - Native iOS uses the UIKit footer action bridged through `__nativeFooterAction('settings')`.
      - Desktop web/Tauri are Not required because SET-061 covers desktop dialog behavior.
    - **Micro-states:**
      - Reader content is loaded and mobile footer/native footer is available.
      - Settings sheet opens within HalfSheet.
      - Font, font size, line spacing, margins, theme, and dark mode controls render.
      - Native brightness control appears only when supported.
      - Sheet can be dismissed and footer active state clears.
    - **Post-state effects:**
      - Safe control changes update Reader preview/settings for active book/global mode as implemented.
      - Dismiss preserves current settings.
      - Reader remains scrollable/readable after dismissal.
      - Native footer active tab returns to neutral/null state.
    - **Intersections:**
      - Mobile web footer Settings button.
      - iOS native footer bridge action.
      - Android Back/drag/toggle close behavior.
      - Screen brightness support present/absent.
      - Safe-area and keyboard/gesture overlap.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - MobileFooterBarV2 controls active HalfSheet state.
      - Native iOS footer actions call `window.__nativeFooterAction`.
      - MobileSettingsContent saves representative view/system settings through settings helpers/stores.
    - **Direct effects:**
      - User can access compact Reader settings on mobile/native platforms.
    - **Downstream effects:**
      - Establishes mobile/native prerequisite for persistence and cross-platform Reader settings checks.
      - Confirms native footer active-tab synchronization does not break Reader navigation.
      - Separates compact mobile controls from full desktop Custom/scope/reset coverage.
    - **Platform guardrails:**
      - iOS native footer overlay must not cover sheet content or block dismissal.
      - Android Back should close sheet before leaving Reader where applicable.
      - Mobile web safe-area padding must keep controls reachable.
    - **Must-not-change guardrails:**
      - Opening/dismissing the sheet must not mutate unrelated Reader settings, profile, billing, API keys, BYOK keys, storage, sync, or library data.
      - Sheet dismissal must not sign the user out.
      - Sheet dismissal must not switch active book or reading position.
  - **Preconditions:** Mobile web or native Reader with a book loaded.
  - **Start state:** Reader content is stable and settings sheet is closed.
  - **Transient states:** Footer/native Settings control opens compact sheet/half-sheet.
  - **Terminal states:** Success = correct mobile/native sheet opens and dismisses safely; Cancel = dismissal preserves settings; Error = desktop dialog appears incorrectly or sheet traps navigation.
  - **Screenshot evidence:**
    - `SET-062-start-reader-mobile-native-settings-sheet`
    - Optional: `SET-062-transient-reader-mobile-native-settings-sheet if observable`
    - `SET-062-terminal-reader-mobile-native-settings-sheet`
  - **Assertions/evidence:**
    - Platform capture, sheet state, and dismiss behavior.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-063 — Reader settings panel switching and search**
  - **Scope:** Global Reader defaults and per-book Reader settings.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
    - `mobile-web-android`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
  - **Scenario overview:** Desktop Reader user switches SettingsDialog panels and uses Search Settings handoff to reach/highlight a target setting without losing dialog state.
  - **Interaction coverage:**
    - **Controls/actions:** Click Font/Layout/Color/Behavior/Language/Custom tabs, open Search Settings, select a result, and verify active/highlighted target panel.
    - **Platform paths:**
      - Desktop web and Tauri lanes use SettingsDialog tabs and Search Settings button.
      - Mobile web/native are Not required because compact sheet behavior is covered separately.
    - **Micro-states:**
      - Dialog opens on default or `lastConfigPanel`.
      - Clicking a tab changes active panel.
      - Active tab label/state updates and `lastConfigPanel` persists.
      - Search Settings opens command palette and closes dialog.
      - Selecting a settings result reopens/navigates to target panel and scrolls/highlights item.
    - **Post-state effects:**
      - User can reach every desktop Reader settings panel.
      - Search handoff does not trap focus or leave stale active item id.
      - Last selected panel is available for future dialog open.
      - No setting values change from panel switching/search alone.
    - **Intersections:**
      - All six panel tabs.
      - Long/narrow tab label overflow.
      - Search shortcut/button.
      - Command palette result targeting `settings.panel.item` ids.
      - Close/reopen after search handoff.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - SettingsDialog tracks activePanel and persists `lastConfigPanel` in localStorage.
      - Command palette can set `activeSettingsItemId`.
      - SettingsDialog maps active settings item ids to panels and scrolls/highlights matching `data-setting-id`.
    - **Direct effects:**
      - User can navigate and search the full desktop Reader settings surface.
    - **Downstream effects:**
      - Panel selection sets context for reset/custom CSS/scope tests.
      - Search evidence proves settings discoverability and deep linking.
      - LocalStorage panel persistence intersects with reload/reopen scenario.
    - **Platform guardrails:**
      - WebKit/Edge focus behavior must not trap users in command palette/dialog transitions.
      - Tauri desktop shortcuts/menus must not conflict with Search Settings.
      - Tab overflow must remain operable at narrow desktop widths.
    - **Must-not-change guardrails:**
      - Switching/searching panels must not mutate Reader settings values, profile, billing, API keys, BYOK keys, storage, sync, or library data.
      - Search handoff must not sign the user out.
      - Search handoff must not change active book or reading position.
  - **Preconditions:** Reader SettingsDialog is open.
  - **Start state:** A default/last panel is active.
  - **Transient states:** User switches panels and uses Search Settings handoff.
  - **Terminal states:** Success = target panels/search results are reachable and active state is clear; Cancel = closing search/panel leaves dialog stable; Error = panel state lost or search traps focus.
  - **Screenshot evidence:**
    - `SET-063-start-reader-settings-panel-switching-and-search`
    - Optional: `SET-063-transient-reader-settings-panel-switching-and-search if observable`
    - `SET-063-terminal-reader-settings-panel-switching-and-search`
  - **Assertions/evidence:**
    - Panel before/after state, search result/handoff capture, and focus note.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-064 — Reader global vs per-book scope**
  - **Scope:** Global Reader defaults and per-book Reader settings.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
    - `mobile-web-android`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
  - **Scenario overview:** Desktop Reader user toggles Global Settings versus this-book scope and proves a representative setting applies only to the intended target.
  - **Interaction coverage:**
    - **Controls/actions:** Open Settings menu, toggle Global Settings on/off, change one representative setting, then compare active book, unrelated book, and global defaults.
    - **Platform paths:**
      - Desktop web and Tauri lanes use SettingsDialog menu Global Settings control.
      - Mobile web/native are Not required because compact sheet does not expose the full desktop scope/menu contract here.
    - **Micro-states:**
      - Known book A and unrelated book B have captured baseline values.
      - Global Settings indicator shows checked/unchecked state.
      - Representative setting change is applied while global is on.
      - Representative setting change is applied while global is off.
      - Book/global values are re-read after navigation/reopen.
    - **Post-state effects:**
      - Global-on change updates global defaults and currently open books as designed.
      - Global-off change updates only the active book/config.
      - Unrelated book/global defaults do not receive unintended per-book changes.
      - User can restore fixture values after test.
    - **Intersections:**
      - Global Settings checked state.
      - Apply to This Book unchecked state.
      - Active primary book save path.
      - Unrelated book comparison.
      - Reload/reopen verification.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - DialogMenu toggles `isSettingsGlobal`.
      - saveViewSettings writes `settings.globalViewSettings` when global and active book config when per-book.
      - Reader/book stores expose view settings for active and unrelated books.
    - **Direct effects:**
      - User controls whether Reader setting changes become global defaults or stay book-specific.
    - **Downstream effects:**
      - Establishes scope truth for reset, custom CSS, and persistence scenarios.
      - Prevents regressions where settings leak across unrelated books.
      - Provides evidence for the known scope-clarity caveat.
    - **Platform guardrails:**
      - Desktop menu tooltip/check state must be visible enough to distinguish global versus this-book scope.
      - Tauri desktop persistence must match web behavior for local/native storage.
    - **Must-not-change guardrails:**
      - Scope toggling alone must not mutate setting values.
      - Per-book changes must not overwrite global defaults or unrelated book values.
      - Global/per-book changes must not mutate profile, billing, API keys, BYOK keys, storage, sync, or library metadata.
      - Scope testing must not sign the user out.
  - **Preconditions:** Reader SettingsDialog open for a known book with global scope control visible.
  - **Start state:** Current scope and representative setting values are known.
  - **Transient states:** User toggles global/per-book scope and changes one representative setting.
  - **Terminal states:** Success = change applies only to intended global or book target; Cancel = revert restores prior values; Error = scope leaks across unrelated books/global defaults.
  - **Screenshot evidence:**
    - `SET-064-start-reader-global-vs-per-book-scope`
    - Optional: `SET-064-transient-reader-global-vs-per-book-scope if observable`
    - `SET-064-terminal-reader-global-vs-per-book-scope`
  - **Assertions/evidence:**
    - Before/after values for active book, another book/global defaults, and reload state.
    - Known reader-settings caveat: global vs per-book scope clarity still needs explicit before/after evidence across at least one unrelated book.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-065 — Reader panel reset**
  - **Scope:** Global Reader defaults and per-book Reader settings.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
    - `mobile-web-android`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
  - **Scenario overview:** Desktop Reader user resets the active settings panel and confirms only that panel's documented values reset within the intended scope.
  - **Interaction coverage:**
    - **Controls/actions:** Modify values in one panel, open Settings Menu, choose Reset current panel, and compare before/after values plus unrelated panel values.
    - **Platform paths:**
      - Desktop web and Tauri lanes use SettingsDialog menu reset for the active panel.
      - Mobile web/native are Not required because this reset contract targets the desktop dialog/menu.
    - **Micro-states:**
      - Active panel has non-default fixture values.
      - Settings Menu displays panel-specific reset label.
      - Reset action invokes the registered panel reset function.
      - Active panel controls update to defaults.
      - Unrelated panel controls remain unchanged.
    - **Post-state effects:**
      - Documented active-panel values reset to default for the current scope.
      - Reader preview/styles update if the reset affects rendered view settings.
      - Scope behavior follows Global Settings versus this-book state.
      - Fixture can be restored after reset.
    - **Intersections:**
      - Font/Layout/Color/Behavior/Language/Custom representative panel reset.
      - Global-on versus per-book scope.
      - Unrelated-panel before/after check.
      - Reader renderer style update.
      - Custom font management reset adjacency.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - Each SettingsDialog panel registers an `onRegisterReset` handler.
      - DialogMenu invokes `handleResetCurrentPanel` with active panel context.
      - useResetViewSettings/appService default view settings provide reset baselines.
    - **Direct effects:**
      - User can restore a panel's Reader settings defaults without manually editing each control.
    - **Downstream effects:**
      - Reset behavior affects persistence and scope tests.
      - Prevents panel reset from becoming a broad destructive all-settings action.
      - Provides recovery path after CSS/style experiments.
    - **Platform guardrails:**
      - Reset menu must remain reachable in desktop web/Tauri at narrow widths.
      - Tauri storage persistence after reset must match web behavior.
    - **Must-not-change guardrails:**
      - Reset must not alter unrelated panels or wrong global/per-book scope.
      - Reset must not delete custom fonts unless the explicit Clear Custom Fonts action is used.
      - Reset must not mutate profile, billing, API keys, BYOK keys, storage, sync, or library metadata.
      - Reset must not sign the user out.
  - **Preconditions:** Reader SettingsDialog open with modified panel values.
  - **Start state:** Panel has non-default values.
  - **Transient states:** User triggers reset for the current panel.
  - **Terminal states:** Success = documented panel values reset and unrelated panels remain unchanged; Cancel = cancel/avoid reset preserves values; Error = reset affects wrong scope or unrelated settings.
  - **Screenshot evidence:**
    - `SET-065-start-reader-panel-reset`
    - Optional: `SET-065-transient-reader-panel-reset if observable`
    - `SET-065-terminal-reader-panel-reset`
  - **Assertions/evidence:**
    - Before/after panel values and unrelated-panel check.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-066 — Reader invalid Custom CSS recovery**
  - **Scope:** Global Reader defaults and per-book Reader settings.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
    - `mobile-web-android`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
    - `native-android`: Not required
      - **Status:** Consistent
      - **Reason:** This scenario targets the desktop Reader settings dialog; mobile/native sheet behavior is covered separately.
  - **Scenario overview:** Desktop Reader user enters invalid Custom Content/Reader UI CSS and confirms validation blocks apply, preserves prior valid CSS, and allows recovery.
  - **Interaction coverage:**
    - **Controls/actions:** Open Custom panel, type invalid CSS into content/UI textarea, observe validation/disabled Apply, recover by clearing or entering valid CSS, and apply valid state.
    - **Platform paths:**
      - Desktop web and Tauri lanes use SettingsDialog Custom panel.
      - Mobile web/native are Not required because compact sheet does not expose the full Custom CSS editors.
    - **Micro-states:**
      - Existing valid Custom Content CSS and Reader UI CSS values are captured.
      - Invalid CSS is typed and draft becomes unsaved.
      - Validation error appears and Apply is disabled.
      - Reader UI/content remains usable while invalid draft exists.
      - Clearing/fixing CSS removes error and enables Apply.
      - Valid apply updates saved draft/style state.
    - **Post-state effects:**
      - Invalid CSS does not persist to saved view settings.
      - Prior valid CSS remains effective until valid apply or clear.
      - Recovered valid/cleared CSS can be saved and reflected in Reader styles.
      - Android-specific textarea focus handling is out of this desktop contract.
    - **Intersections:**
      - Custom Content CSS invalid draft.
      - Custom Reader UI CSS invalid draft.
      - Empty CSS as valid clear.
      - Format/apply valid CSS.
      - Global versus per-book CSS scope if combined with SET-064.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - MiscPanel validates CSS through `validateCSS` and formats through `formatCSS`.
      - Apply button is hidden/disabled based on saved/error state.
      - saveViewSettings persists only formatted valid/cleared CSS.
      - Reader renderer applies styles from saved view settings.
    - **Direct effects:**
      - User receives immediate Custom CSS validation and can recover without breaking Reader.
    - **Downstream effects:**
      - Protects Reader UI/content from invalid user stylesheet persistence.
      - Provides recovery path for style customization before persistence/reload tests.
      - Confirms custom CSS scope must be paired with global/per-book evidence when relevant.
    - **Platform guardrails:**
      - WebKit/Edge textarea/input and disabled-button behavior must match Chromium.
      - Tauri desktop custom CSS editing must preserve app shell usability.
    - **Must-not-change guardrails:**
      - Invalid CSS must not be saved, applied, or persisted after close/reopen.
      - Invalid CSS must not break Settings dialog controls or Reader navigation.
      - CSS recovery must not mutate unrelated Reader settings, profile, billing, API keys, BYOK keys, storage, sync, or library metadata.
      - CSS recovery must not sign the user out.
  - **Preconditions:** Reader SettingsDialog Custom panel is open.
  - **Start state:** Existing valid Custom CSS state is known.
  - **Transient states:** User enters invalid Custom Content CSS or Reader UI CSS and applies/formats.
  - **Terminal states:** Success = validation error is visible and user can recover to valid/cleared CSS; Cancel = closing without apply preserves prior valid CSS; Error = invalid CSS persists or breaks Reader UI.
  - **Screenshot evidence:**
    - `SET-066-start-reader-invalid-custom-css-recovery`
    - Optional: `SET-066-transient-reader-invalid-custom-css-recovery if observable`
    - `SET-066-terminal-reader-invalid-custom-css-recovery`
  - **Assertions/evidence:**
    - Validation copy, recovered CSS state, and Reader still usable.
    - Known reader-settings caveat: Custom CSS recovery must prove invalid CSS does not persist or break the Reader UI.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.
- [ ] **SET-067 — Reader settings persistence after reload/reopen**
  - **Scope:** Global Reader defaults and per-book Reader settings.
  - **Platforms:**
    - `web-chromium`: Required
      - **Status:** Consistent
    - `web-webkit`: Required
      - **Status:** Consistent
    - `web-edge-windows`: Required
      - **Status:** Consistent
    - `mobile-web-ios`: Required
      - **Status:** Consistent
    - `mobile-web-android`: Required
      - **Status:** Consistent
    - `tauri-macos`: Required
      - **Status:** Consistent
    - `tauri-windows`: Required
      - **Status:** Consistent
    - `native-ios`: Required
      - **Status:** Consistent
    - `native-android`: Required
      - **Status:** Consistent
  - **Scenario overview:** User changes representative Reader settings, reloads/reopens Reader, and confirms saved values rehydrate for the correct global/book scope across platforms.
  - **Interaction coverage:**
    - **Controls/actions:** Change representative desktop or mobile Reader settings, close/reopen Settings, reload/reopen Reader/app, and compare saved values plus rendered Reader output.
    - **Platform paths:**
      - Desktop web/Tauri use SettingsDialog representative controls.
      - Mobile web/native use MobileSettings sheet representative controls.
      - Native lanes validate app/WebView lifecycle reopen in addition to page reload where feasible.
    - **Micro-states:**
      - Baseline values are captured before mutation.
      - Representative values are changed and saved/applied.
      - Settings surface is closed.
      - Reader page/app is reloaded or reopened.
      - Settings surface reopens and values match saved state.
      - Rendered Reader output reflects the saved settings.
    - **Post-state effects:**
      - Saved global or per-book values rehydrate for the intended scope.
      - Wrong book does not inherit per-book-only values.
      - Nested settings such as CSS/theme/layout values persist when saved.
      - Test restores fixture values after evidence capture.
    - **Intersections:**
      - Desktop dialog persistence.
      - Mobile/native sheet persistence.
      - Global versus per-book scope.
      - Nested/custom settings.
      - Browser reload, Tauri window/app reopen, native lifecycle resume.
  - **Impact coverage:**
    - **Upstream dependencies:**
      - saveViewSettings/saveSysSettings persist values through environment appService.
      - Reader/book stores hydrate view settings from saved config/defaults.
      - Theme/settings stores persist system-level reader preferences where applicable.
    - **Direct effects:**
      - User's Reader settings survive reload/reopen for the intended platform and scope.
    - **Downstream effects:**
      - Confirms settings changes from SET-061–SET-066 are durable when expected.
      - Detects scope leaks or storage regressions across books/platform lifecycles.
      - Supports release confidence for native and browser storage adapters.
    - **Platform guardrails:**
      - Web storage reload must match desktop browser lanes.
      - Tauri storage/appService persistence must survive window close/reopen.
      - Native mobile lifecycle resume/reopen must not drop saved settings or apply wrong safe-area/brightness state.
    - **Must-not-change guardrails:**
      - Persistence checks must not assert unsaved drafts as saved state.
      - Reload/reopen must not apply per-book settings to unrelated books.
      - Persistence testing must not mutate profile, billing, API keys, BYOK keys, storage quotas, sync settings, or library metadata.
      - Persistence testing must not sign the user out.
  - **Preconditions:** Reader with modified representative settings.
  - **Start state:** Settings are saved and Reader can be closed/reopened/reloaded.
  - **Transient states:** Reader is closed/reopened or app page reloads.
  - **Terminal states:** Success = saved settings rehydrate for the correct global/book scope; Cancel = not applicable; Error = settings reset unexpectedly or wrong book inherits values.
  - **Screenshot evidence:**
    - `SET-067-start-reader-settings-persistence-after-reload-reopen`
    - Optional: `SET-067-transient-reader-settings-persistence-after-reload-reopen if observable`
    - `SET-067-terminal-reader-settings-persistence-after-reload-reopen`
  - **Assertions/evidence:**
    - Before/after saved values, reload capture, and scope check.
    - Known reader-settings caveat: persistence checks must include nested settings and verify the correct global/book scope after reload or reopen.
  - **Automation notes:** Use deterministic fixtures where possible, attach screenshots for start/transient/terminal states, and assert the scenario evidence before cleanup.

#### Platform behavior

- [ ] `web-chromium`: golden lane for route/tab smoke, billing render, API-key create-dialog no-submit, preferences/account smoke, Reader settings dialog shell, and first MCP lifecycle proof.
- [ ] `web-webkit`: validate dialog focus, tab overflow, localStorage preferences, export/download behavior, and Safari/WebKit form quirks.
- [ ] `web-edge-windows`: validate Windows focus/scrollbar behavior, MCP Windows path copy, Stripe/export popup/download behavior, and high-contrast reports.
- [ ] `mobile-web-ios` / `mobile-web-android`: validate mobile drawer/header access, tab overflow, keyboard behavior, alert dialogs, safe areas, Android Back, download/export handling, and Reader mobile settings sheet.
- [ ] `tauri-macos` / `tauri-windows`: validate native shell/titlebar, local settings persistence, file selectors for Reader custom assets, export path, external browser/Stripe handoff, and MCP config paths.
- [ ] `native-ios`: validate Settings route reachability, toolbar/menu/back affordance, safe-area spacing, forms/dialogs, auth redirect, and Reader native footer Settings half-sheet.
- [ ] `native-android`: validate WebView Settings pages, Android Back close hierarchy, keyboard/focus behavior, export/download behavior, and Reader settings sheet.

#### Inconsistencies / watch items

Scenario-specific inconsistencies now live in the relevant SET scenarios above. Keep this section only for cross-cutting Settings issues that cannot be attached to a single scenario.

<a id="48-sync"></a>

### 4.8 Sync

Status: `Unknown / needs audit`

```txt
Sync
├─ Current state
├─ User workflows
│  ├─ Sign in/out sync behavior
│  ├─ Manual sync
│  ├─ Progress sync
│  ├─ Annotation/note sync
│  ├─ Offline retry
│  └─ Conflict/recovery behavior
├─ Controls and entry points
├─ Platform behavior
├─ Data/state/persistence
├─ Wiring notes
├─ Inconsistencies / watch items
├─ QA baseline
└─ Implementation references
```

<a id="49-billing--quotas"></a>

### 4.9 Billing / quotas

Status: `Unknown / needs audit`

```txt
Billing / quotas
├─ Current state
├─ User workflows
│  ├─ View plan/tier
│  ├─ Upgrade/manage billing
│  ├─ AI quota usage
│  ├─ Boost packs
│  └─ Gated feature messaging
├─ Controls and entry points
├─ Platform behavior
├─ Data/state/persistence
├─ Wiring notes
├─ Inconsistencies / watch items
├─ QA baseline
└─ Implementation references
```

#### Current state

- [ ] Gen 3 v3 final launch tiers are Free / Reader / Pro only.
- [ ] Runtime source of truth is the latest `public.tier_config` row; fallback is `apps/openread-app/src/lib/tier-defaults.ts`.
- [ ] TTS, translation, storage add-ons, and boosts are disabled for launch across every tier.
- [ ] Storage quota is tier-only: Free 1 GB, Reader 10 GB, Pro 50 GB; quota API should return `addon_gb: 0`, `active_addons: []`, and `available_addons: []`.
- [ ] Storage add-on checkout/cancel endpoints should return `410 STORAGE_ADDONS_DISABLED`.

<a id="410-mcp--api-keys"></a>

### 4.10 MCP / API keys

Status: `Unknown / needs audit`

```txt
MCP / API keys
├─ Current state
├─ User workflows
│  ├─ Create API key
│  ├─ Copy/revoke API key
│  ├─ Configure MCP client
│  ├─ Authenticate MCP server
│  └─ Use book/library MCP tools
├─ Controls and entry points
├─ Platform behavior
├─ Data/state/persistence
├─ Wiring notes
├─ Inconsistencies / watch items
├─ QA baseline
└─ Implementation references
```

<a id="411-native-shell-integrations"></a>

### 4.11 Native shell integrations

Status: `Unknown / needs audit`

```txt
Native shell integrations
├─ Current state
├─ Platform integrations
│  ├─ macOS app shell/window behavior
│  ├─ Windows app shell/window behavior
│  ├─ iOS UIKit overlays and bridge messages
│  ├─ Android bridge behavior
│  ├─ Deep links
│  ├─ File open/import
│  └─ Device APIs
├─ Controls and entry points
├─ Platform behavior
├─ Data/state/persistence
├─ Wiring notes
├─ Inconsistencies / watch items
├─ QA baseline
└─ Implementation references
```

<a id="5-cross-feature-inconsistencies-and-weird-wiring"></a>

## 5. Cross-feature inconsistencies and weird wiring

Use this section for risks that cut across feature boundaries.

```txt
Cross-feature inconsistencies and weird wiring
├─ Duplicate labels
├─ Multiple entry points to the same action
├─ Platform mismatches
├─ Disabled or hidden controls
├─ Stale state risks
├─ Routing/deep-link risks
├─ Native bridge risks
├─ Persistence/sync risks
├─ Tier/gating mismatch risks
└─ Evidence and owner
```

Initial known buckets:

- [ ] Duplicate labels: Search, AI Chat/Chat, Settings, Close/Back, Sync, Import/Add, Read/Open.
- [ ] Multiple entry points: Reader open, AI chat, book search, annotations, settings, sync.
- [ ] Platform mismatches: mobile web vs iOS native, iOS native vs Android native, browser desktop vs Tauri desktop.
- [ ] Disabled/hidden controls: commented or gated controls that may still have code paths.
- [ ] Stale state risks: active book vs primary book, current account/tier, route params, native callback target, cached settings.
- [ ] Routing/deep-link risks: path/query parity, invalid IDs, no-ID states, external links, PWA/Tauri windows.
- [ ] Native bridge risks: unknown action values, lifecycle timing, keyboard/safe-area overlap, callback failures.

<a id="6-qa-baseline"></a>

## 6. QA baseline

```txt
QA baseline
├─ Manual smoke checks
├─ Feature-level checks
├─ Platform-specific checks
├─ Release/deployment checks
└─ Evidence requirements
```

<a id="manual-smoke-checks"></a>

### Manual smoke checks

- [ ] App launches on target platform.
- [ ] Auth/session state is correct.
- [ ] Library loads or empty state is understandable.
- [ ] A book can be opened into Reader.
- [ ] Reader can return to Library without data loss.
- [ ] Settings open and close.
- [ ] Platform-specific shell controls do not block core flows.

<a id="feature-level-checks"></a>

### Feature-level checks

- [ ] Each changed feature has its baseline section updated.
- [ ] Current behavior is distinguished from planned behavior.
- [ ] All new controls have platform behavior and QA items.
- [ ] All changed routes/deep links are documented.
- [ ] All changed native bridge behavior is documented.

<a id="platform-specific-checks"></a>

### Platform-specific checks

- [ ] Web desktop checked for Chromium-first baseline.
- [ ] WebKit/Safari checked when selection, layout, media, or browser API behavior changes.
- [ ] Mobile web checked when viewport, touch, keyboard, or safe-area behavior changes.
- [ ] macOS/Windows Tauri checked when file/window/native context behavior changes.
- [ ] iOS native checked when UIKit overlays, native menu, keyboard, safe area, or bridge messages change.
- [ ] Android native checked when Back, selection, WebView, device buttons, or bridge messages change.

<a id="releasedeployment-checks"></a>

### Release/deployment checks

- [ ] Feature baseline updated.
- [ ] QA checklist updated or confirmed unchanged.
- [ ] Known weird wiring reviewed for regressions.
- [ ] Required platform surfaces selected and justified.
- [ ] Evidence captured and linked.
- [ ] Automated checks run or intentionally skipped with reason.

<a id="7-implementation-reference-map"></a>

## 7. Implementation reference map

Status: `Unknown / needs audit`

```txt
Implementation reference map
├─ Routes
├─ Components
├─ Stores
├─ Services
├─ Native bridges
├─ Test specs
└─ Docs/runbooks
```

Initial references:

- [ ] App frontend: `apps/openread-app/src/`
- [ ] Reader: `apps/openread-app/src/app/reader/`
- [ ] Native bridges: `apps/openread-app/src-tauri/plugins/`
- [ ] API: `apps/api/`
- [ ] MCP package: `packages/mcp/`
- [ ] Catalog pipeline: `packages/catalog/`
- [ ] Shared DB schema: `packages/db/`
- [ ] E2E tests: `apps/openread-app/e2e/`
- [ ] Manual QA docs: `https://github.com/openread-ai/openread-docs/tree/main/testing`
