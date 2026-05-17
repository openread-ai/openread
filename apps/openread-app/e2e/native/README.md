# Native/Tauri Settings validation ctl

ACT-093 cannot close the PR #90 Settings contract from Chromium evidence alone. Native and Tauri required cells need controller-backed runs, not manual-only screenshots.

## Controllers

| Platform         | Controller                                                                                           | Status                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `native-ios`     | Appium 2 + XCUITest driver + `xcrun simctl` deep-link open                                           | ctl health/settings runner wired into QA CLI                 |
| `native-ipados`  | Appium 2 + XCUITest driver + iPad simulator/deep link                                                | ctl health/settings runner wired into QA CLI                 |
| `native-android` | Appium 2 + UiAutomator2 driver + controlled WebView route                                            | ctl health/settings runner wired into QA CLI                 |
| `tauri-windows`  | `tauri-driver` + Edge WebDriver + built Tauri binary                                                 | local Windows health/capture runner wired into QA CLI        |
| `tauri-macos`    | In-app Tauri QA controller + macOS `open`/`screencapture`; `tauri-driver` v2 is unsupported on macOS | local macOS health/capture/settings runner wired into QA CLI |

## Appium setup

The repo scripts keep Appium extensions under `~/.openread-dev/appium` by default so runner setup is reproducible without adding large native-driver packages to the workspace lockfile.

```sh
cd apps/openread-app
corepack pnpm native:appium:drivers
```

Start the Appium server with `bg_process` or another long-running process manager. The script enables Chromedriver autodownload so Android WebView contexts can be controlled when the emulator WebView version changes, and uses warn-level Appium logs so WebDriver session-injection payloads are not printed to stdout.

```sh
cd apps/openread-app
corepack pnpm native:appium:start
```

`native:health` requires these auth env vars for authenticated WebDriver health: `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The runner signs in from Node and injects the resulting Supabase session through the WebDriver WEBVIEW context; secrets are not passed through deep links.

## Desktop Tauri setup

macOS local automation needs a built `.app`. The QA build disables updater artifact signing so local runners do not need `TAURI_SIGNING_PRIVATE_KEY`. `tauri-driver` v2 currently reports unsupported on macOS, so strict Settings SET validation uses a QA-only in-app Tauri controller that navigates real routes, exercises/asserts real UI state, posts a local callback result, and then captures a macOS screenshot.

```sh
cd apps/openread-app
corepack pnpm tauri:build-macos-qa
export OPENREAD_TAURI_MACOS_APPLICATION="$(git rev-parse --show-toplevel)/target/debug/bundle/macos/Openread.app"
```

Windows automation must run on a local Windows host or VM because the adapter launches a Windows Tauri binary through `tauri-driver` and Edge WebDriver.

```powershell
# On Windows: install tools, then keep both commands available on PATH.
cargo install tauri-driver
msedgedriver --version

# Build/provide the Windows Openread binary, then point the ctl runner at it.
$env:OPENREAD_TAURI_WINDOWS_APPLICATION = "C:\\path\\to\\openread.exe"
```

## Readiness

```sh
cd apps/openread-app
corepack pnpm native:readiness -- \
  --activity ACT-093 \
  --platform native-ios,native-ipados,native-android,tauri-windows,tauri-macos
```

Readiness writes:

```text
~/.openread-dev/activity-artifacts/<activity>/<attempt>/native-ctl/native-ctl-report.json
```

## Health smoke

Native mobile and Windows health open `/auth`, verify the app exposes a controller-backed WEBVIEW, clear stale auth, inject a test Supabase session, open an authenticated surface (`/library` or the native `/home` redirect), verify Openread auth storage, clear the session, and screenshot each step. iOS/iPadOS use the `openread://activity-capture` deep link for initial launch, then route inside the controlled WebView for deterministic post-login navigation; Android routes inside the controlled WebView after Appium launches the installed app because the generated Android manifest does not register the `openread://activity-capture` scheme yet. macOS Tauri health remains AX/screenshot-backed: it launches the `.app`, opens the activity-capture deep link, and captures evidence without DOM/auth injection. Strict macOS Settings SET validation is a separate `tauri-driver` WebDriver lane. If Android WebView discovery flakes on a warm emulator, force-stop `com.reglity.openread` first and/or pass `--webview-timeout-ms 60000`.

```sh
# iOS simulator/Appium
corepack pnpm native:health -- \
  --activity ACT-093 \
  --platform native-ios

# iPadOS simulator/Appium; platform version is auto-detected from simctl
corepack pnpm native:health -- \
  --activity ACT-093 \
  --platform native-ipados \
  --ipad-device-name "iPad Pro 11-inch (M4)"

# Android device or emulator/Appium
corepack pnpm native:health -- \
  --activity ACT-093 \
  --platform native-android \
  --android-serial <adb-serial> \
  --webview-timeout-ms 60000

# Windows Tauri shell via tauri-driver on a local Windows host/VM
# Prereqs: built Windows app binary, tauri-driver, and msedgedriver on PATH.
corepack pnpm native:health -- \
  --activity ACT-092 \
  --platform tauri-windows \
  --windows-application <path-to-built-openread.exe>

# macOS Tauri shell via local AX/screencapture controller
# Note: this is health/capture evidence only, not DOM-level Settings SET closure.
corepack pnpm native:health -- \
  --activity ACT-092 \
  --platform tauri-macos \
  --macos-application <path-to-Openread.app>
```

## Native/Tauri Settings SET runner

The Settings runner produces `expected-current-report.json` files that the Settings contract audit can consume. Native mobile uses Appium WebView control. macOS Tauri defaults to `--macos-settings-controller app`, launches the `.app`, opens QA-gated activity-capture routes with a local callback URL, lets the in-app Tauri QA controller exercise/assert real UI state, and captures screenshots. This emits `qa-seam-real-ui` evidence. The legacy `--macos-settings-controller bridge` path remains available for capture debugging but emits `fixture-overlay` evidence, which strict contract mode intentionally treats as provisional. `--macos-settings-controller webdriver` fails fast on macOS with the upstream `tauri-driver` support blocker. `SET-049` is excluded from the default macOS Settings UI-controller run and remains open because the contract requires separate redacted external MCP auth/tool logs.

```sh
# iOS or Android
corepack pnpm native:settings -- \
  --activity ACT-093 \
  --platform native-ios,native-android

# Native mobile matrix through the QA CLI
corepack pnpm exec node e2e/qa/cli.mjs run \
  --activity ACT-093 \
  --lane settings \
  --matrix native-mobile

# Direct iPadOS run; platform version is auto-detected from simctl
corepack pnpm native:settings -- \
  --activity ACT-093 \
  --platform native-ipados \
  --ipad-device-name "iPad Pro 11-inch (M4)"

# macOS Tauri Settings through the in-app Tauri QA controller
corepack pnpm native:settings -- \
  --activity ACT-093 \
  --platform tauri-macos \
  --macos-application "$OPENREAD_TAURI_MACOS_APPLICATION" \
  --macos-settings-controller app
```

Reports are written under:

```text
~/.openread-dev/activity-artifacts/<activity>/<attempt>/testing/<native-platform>/native-settings-contract/expected-current-report.json
~/.openread-dev/activity-artifacts/<activity>/<attempt>/testing/tauri-macos/desktop-settings-contract/expected-current-report.json
```

## Capture smoke

Capture commands prove the controller can launch the app/deep link and capture a screenshot. They do **not** close the 67-SET contract by themselves; the Settings contract coverage audit still has to show every required SET/platform cell as matched with scenario evidence.

```sh
# iOS simulator/Appium
corepack pnpm exec node e2e/native/ctl.mjs capture \
  --activity ACT-093 \
  --platform native-ios \
  --route /settings/account

# Android device or emulator/Appium; falls back to controlled WebView routing when
# the generated manifest does not expose openread://activity-capture.
corepack pnpm exec node e2e/native/ctl.mjs capture \
  --activity ACT-093 \
  --platform native-android \
  --android-serial <adb-serial> \
  --route /settings/account

# Windows Tauri shell via tauri-driver on a local Windows host/VM
corepack pnpm exec node e2e/native/ctl.mjs capture \
  --activity ACT-092 \
  --platform tauri-windows \
  --windows-application <path-to-built-openread.exe>

# macOS Tauri shell via local AX/screencapture controller
corepack pnpm exec node e2e/native/ctl.mjs capture \
  --activity ACT-092 \
  --platform tauri-macos \
  --macos-application <path-to-Openread.app>
```

## Closure rule

PR #90 Settings is not clean until:

1. `e2e/qa/cli.mjs contract --activity ACT-093` reports `passed`.
2. Every required `SET-001`–`SET-067` platform cell has scenario evidence.
3. Native/Tauri cells are controller-backed; manual screenshots are supplementary only.
4. `not-required` cells prove the platform-specific exclusion, e.g. API Keys hidden/guarded outside web.
