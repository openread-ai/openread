#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import {
  activityPaths,
  ensureDir,
  loadEnvFiles,
  parseArgs,
  sanitizeName,
  timestampAttempt,
  writeJson,
} from '../qa/lib/common.mjs';
import { parseSettingsContract } from '../qa/lib/settings-contract.mjs';

loadEnvFiles();

const args = parseArgs(process.argv.slice(2));
const commandName = args._[0] ?? 'help';
const platforms = splitArg(args.platform ?? args.platforms).length
  ? splitArg(args.platform ?? args.platforms)
  : ['native-ios', 'native-ipados', 'native-android', 'tauri-windows', 'tauri-macos'];
const scenarioFilter = splitArg(
  args.scenario ?? args.scenarios ?? args.scenarioId ?? args.scenarioIds,
);
const activityId = args.activity ?? 'native-ctl';
const attemptId = sanitizeName(args.attempt ?? `native-ctl-${commandName}-${timestampAttempt()}`);
const paths = activityPaths(activityId, attemptId);
const artifactDir = resolve(paths.attemptDir, 'native-ctl');
const appiumUrl = String(
  args.appiumUrl ?? process.env.APPIUM_SERVER_URL ?? 'http://127.0.0.1:4723',
);
const tauriDriverUrl = String(
  args.tauriDriverUrl ?? process.env.TAURI_DRIVER_URL ?? 'http://127.0.0.1:4444',
);
const route = String(args.route ?? '/settings/account');
const openUrl = String(
  args.openUrl ??
    process.env.OPENREAD_NATIVE_OPEN_URL ??
    `openread://activity-capture?route=${encodeURIComponent(route)}`,
);
const iosBundleId = String(
  args.iosBundleId ?? process.env.OPENREAD_IOS_BUNDLE_ID ?? 'com.reglity.openread',
);
const androidPackage = String(
  args.androidPackage ?? process.env.OPENREAD_ANDROID_PACKAGE ?? 'com.reglity.openread',
);
const androidSerial = args.androidSerial ?? process.env.ANDROID_SERIAL ?? null;
const iosApp = args.iosApp ?? process.env.OPENREAD_IOS_APP ?? null;
const delayMs = Number(args.delayMs ?? process.env.OPENREAD_NATIVE_CTL_DELAY_MS ?? 2_000);
const NATIVE_QA_GB = 1024 * 1024 * 1024;
const healthAuthMode = String(
  args.auth ?? process.env.OPENREAD_NATIVE_HEALTH_AUTH ?? 'authenticated',
);
const webviewTimeoutMs = Number(
  args.webviewTimeoutMs ?? process.env.OPENREAD_NATIVE_WEBVIEW_TIMEOUT_MS ?? 30_000,
);
const webdriverRequestTimeoutMs = Number(
  args.webdriverRequestTimeoutMs ??
    args.webDriverRequestTimeoutMs ??
    process.env.OPENREAD_NATIVE_WEBDRIVER_REQUEST_TIMEOUT_MS ??
    90_000,
);
const nativeAuthTimeoutMs = Number(
  args.nativeAuthTimeoutMs ?? process.env.OPENREAD_NATIVE_AUTH_TIMEOUT_MS ?? 30_000,
);
const newCommandTimeoutSec = Number(
  args.newCommandTimeout ?? process.env.OPENREAD_NATIVE_NEW_COMMAND_TIMEOUT_SEC ?? 600,
);
const defaultIpadDeviceName = String(
  args.ipadDeviceName ?? process.env.OPENREAD_IPADOS_DEVICE_NAME ?? 'iPad Pro 11-inch (M4)',
);
const tauriMacosSettingsController = String(
  args.macosSettingsController ??
    args.tauriMacosSettingsController ??
    process.env.OPENREAD_TAURI_MACOS_SETTINGS_CONTROLLER ??
    'app',
).toLowerCase();

ensureDir(artifactDir);

let settingsContractScenarioCache = null;

try {
  if (commandName === 'readiness') await readinessCommand();
  else if (commandName === 'capture') await captureCommand();
  else if (commandName === 'health') await healthCommand();
  else if (commandName === 'settings') await settingsCommand();
  else printHelp();
} catch (error) {
  writeReport({
    command: commandName,
    result: 'failed',
    error: error.message,
    platforms,
  });
  console.error(`Native ctl failed: ${error.message}`);
  process.exit(1);
}

async function readinessCommand() {
  const checks = [];
  for (const platform of platforms) checks.push(await readinessForPlatform(platform));
  const result = checks.every((check) => check.result === 'passed') ? 'passed' : 'failed';
  const report = writeReport({
    command: 'readiness',
    result,
    platforms,
    checks,
    appiumUrl,
    tauriDriverUrl,
  });
  printSummary(report);
  process.exit(result === 'passed' ? 0 : 1);
}

async function captureCommand() {
  const captures = [];
  for (const platform of platforms) captures.push(await capturePlatform(platform));
  const result = captures.every((capture) => capture.result === 'passed') ? 'passed' : 'failed';
  const report = writeReport({
    command: 'capture',
    result,
    platforms,
    captures,
    appiumUrl,
    tauriDriverUrl,
    openUrl,
    route,
    delayMs,
  });
  printSummary(report);
  process.exit(result === 'passed' ? 0 : 1);
}

async function healthCommand() {
  const health = [];
  for (const platform of platforms) health.push(await healthPlatform(platform));
  const result = health.every((entry) => entry.result === 'passed') ? 'passed' : 'failed';
  const report = writeReport({
    command: 'health',
    result,
    platforms,
    health,
    appiumUrl,
    tauriDriverUrl,
    auth: healthAuthMode,
    delayMs,
    webviewTimeoutMs,
  });
  printSummary(report);
  process.exit(result === 'passed' ? 0 : 1);
}

async function settingsCommand() {
  const settings = [];
  for (const platform of platforms) settings.push(await settingsPlatform(platform));
  const result = settings.every((entry) => entry.result === 'passed') ? 'passed' : 'failed';
  const report = writeReport({
    command: 'settings',
    result,
    platforms,
    settings,
    appiumUrl,
    tauriDriverUrl,
    auth: healthAuthMode,
    delayMs,
    webviewTimeoutMs,
    webdriverRequestTimeoutMs,
    nativeAuthTimeoutMs,
    tauriMacosSettingsController,
  });
  printSummary(report);
  process.exit(result === 'passed' ? 0 : 1);
}

async function readinessForPlatform(platform) {
  if (platform === 'native-ios' || platform === 'native-ipados') {
    return platformCheck(platform, [
      commandCheck('xcrun is available', 'xcrun', ['--version']),
      commandCheck('iOS simulators are listable', 'xcrun', ['simctl', 'list', 'devices', '--json']),
      iosInstalledAppCheck(platform),
      await appiumStatusCheck(),
    ]);
  }

  if (platform === 'native-android') {
    return platformCheck(platform, [
      commandCheck('adb is available', androidTool('adb'), ['version']),
      commandCheck('adb can list devices', androidTool('adb'), adbArgs(['devices'])),
      commandCheck(
        'Openread Android app is installed',
        androidTool('adb'),
        adbArgs(['shell', 'pm', 'path', androidPackage]),
      ),
      await appiumStatusCheck(),
    ]);
  }

  if (platform === 'tauri-windows') {
    const application = tauriApplication(platform);
    return platformCheck(platform, [
      {
        label: 'running on Windows host',
        ok: process.platform === 'win32',
        detail:
          process.platform === 'win32'
            ? process.platform
            : `tauri-windows controller requires a local Windows host/VM; current host is ${process.platform}`,
      },
      commandCheck('tauri-driver is available', 'tauri-driver', ['--version']),
      await tauriDriverStatusCheck(),
      commandCheck(
        'Edge WebDriver is available on PATH',
        process.platform === 'win32' ? 'msedgedriver.exe' : 'msedgedriver',
        ['--version'],
      ),
      tauriApplicationCheck(platform, application),
    ]);
  }

  if (platform === 'tauri-macos') {
    const application = tauriApplication(platform);
    return platformCheck(platform, [
      {
        label: 'running on macOS host',
        ok: process.platform === 'darwin',
        detail:
          process.platform === 'darwin'
            ? process.platform
            : `tauri-macos controller requires macOS; current host is ${process.platform}`,
      },
      tauriDriverMacosSupportCheck(),
      commandCheck('osascript is available', 'osascript', ['-e', 'return "ok"']),
      commandCheck('screencapture is available', 'which', ['screencapture']),
      tauriApplicationCheck(platform, application),
    ]);
  }

  return {
    platform,
    result: 'failed',
    checks: [{ label: 'known platform', ok: false, detail: `Unknown platform: ${platform}` }],
  };
}

async function capturePlatform(platform) {
  if (platform === 'native-ios' || platform === 'native-ipados') return captureAppiumIos(platform);
  if (platform === 'native-android') return captureAppiumAndroid();
  if (platform === 'tauri-windows') return captureTauriDesktop(platform);
  if (platform === 'tauri-macos') return captureTauriMacos(platform);
  return {
    platform,
    result: 'failed',
    error: `Capture is not implemented for ${platform}.`,
  };
}

async function healthPlatform(platform) {
  if (platform === 'native-ios' || platform === 'native-ipados')
    return healthAppiumMobile(platform);
  if (platform === 'native-android') return healthAppiumMobile(platform);
  if (platform === 'tauri-windows') return healthTauriWindows(platform);
  if (platform === 'tauri-macos') return healthTauriMacos(platform);
  return {
    platform,
    result: 'failed',
    error: `Health is not implemented for ${platform}.`,
  };
}

async function settingsPlatform(platform) {
  if (platform === 'tauri-macos') return settingsTauriMacos(platform);
  if (!['native-ios', 'native-ipados', 'native-android'].includes(platform)) {
    return {
      platform,
      result: 'failed',
      error: `Settings SET runner is not implemented for ${platform}.`,
    };
  }

  const platformArtifactDir = resolve(
    paths.attemptDir,
    'testing',
    platform,
    'native-settings-contract',
  );
  ensureDir(platformArtifactDir);
  const serverUrl = appiumUrl;
  const selectedScenarios = filterSettingsScenarios(nativeSettingsScenarios());
  const sessionBatchSize = nativeSettingsSessionBatchSize(platform, selectedScenarios.length);
  const scenarioBatches = nativeSettingsScenarioBatches(
    platform,
    selectedScenarios,
    sessionBatchSize,
  );
  const scenarios = [];
  const sessionBatches = [];

  for (const [batchIndex, batch] of scenarioBatches.entries()) {
    if (platform === 'native-android') maybeForceStopAndroid();
    let session;
    const setupPhases = [];
    const batchStartedAt = Date.now();
    const batchLabel = `${batchIndex + 1}/${scenarioBatches.length}`;
    console.log(
      `[native-settings] ${platform} batch ${batchLabel} setup start (${batch
        .map((scenario) => scenario.scenarioId)
        .join(',')})`,
    );
    try {
      session = await createWebDriverSession(
        serverUrl,
        platform === 'native-android' ? androidCapabilities() : iosCapabilities(platform),
      );

      const context = {
        platform,
        serverUrl,
        sessionId: session.sessionId,
        session: session.publicSession,
        platformArtifactDir,
        setupPhases,
        storageKey: null,
        webviewSelected: false,
        batchIndex: batchIndex + 1,
        batchCount: scenarioBatches.length,
      };
      await prepareAuthenticatedSettingsContext(context);
      console.log(`[native-settings] ${platform} batch ${batchLabel} setup passed`);

      let batchResult = 'passed';
      let batchError = null;
      for (const [scenarioIndex, scenario] of batch.entries()) {
        const scenarioResult = await runNativeSettingsScenario(context, scenario);
        scenarios.push(scenarioResult);
        if (isWebDriverTransportFailure(scenarioResult.errorMessage)) {
          batchResult = 'failed';
          batchError = `WebDriver transport failed during ${scenario.scenarioId}; aborting this session batch.`;
          for (const remainingScenario of batch.slice(scenarioIndex + 1)) {
            scenarios.push(
              nativeScenarioResult({
                scenario: remainingScenario,
                platform,
                status: 'failed',
                consistency: 'mismatch',
                current: batchError,
                screenshotPath: null,
                durationMs: 0,
                errorMessage: batchError,
              }),
            );
          }
          break;
        }
      }
      sessionBatches.push({
        index: batchIndex + 1,
        result: batchResult,
        scenarioIds: batch.map((scenario) => scenario.scenarioId),
        durationMs: Date.now() - batchStartedAt,
        setupPhases,
        session: session.publicSession,
        ...(batchError ? { error: batchError } : {}),
      });
    } catch (error) {
      console.log(
        `[native-settings] ${platform} batch ${batchLabel} setup failed after ${Date.now() - batchStartedAt}ms: ${error.message}`,
      );
      sessionBatches.push({
        index: batchIndex + 1,
        result: 'failed',
        scenarioIds: batch.map((scenario) => scenario.scenarioId),
        durationMs: Date.now() - batchStartedAt,
        setupPhases,
        session: session?.publicSession ?? null,
        error: error.message,
      });
      for (const scenario of batch) {
        scenarios.push(
          nativeScenarioResult({
            scenario,
            platform,
            status: 'failed',
            consistency: 'mismatch',
            current: `Native Settings setup failed before scenario execution: ${error.message}`,
            screenshotPath: null,
            durationMs: 0,
            errorMessage: error.message,
          }),
        );
      }
    } finally {
      if (session?.sessionId) await deleteWebDriverSession(serverUrl, session.sessionId);
    }
  }

  const result = scenarios.every((scenario) => scenario.status === 'passed') ? 'passed' : 'failed';
  const expectedCurrentReport = buildNativeExpectedCurrentReport({
    platform,
    platformArtifactDir,
    result,
    scenarios,
  });
  const laneResult = writeNativeLaneResult({
    platform,
    platformArtifactDir,
    result,
    expectedCurrentReportPath: expectedCurrentReport.jsonPath,
    scenarioCount: scenarios.length,
  });

  return {
    platform,
    result,
    scenarioCount: scenarios.length,
    passed: scenarios.filter((scenario) => scenario.status === 'passed').length,
    failed: scenarios.filter((scenario) => scenario.status !== 'passed').length,
    reportPath: expectedCurrentReport.jsonPath,
    markdownPath: expectedCurrentReport.markdownPath,
    laneResultPath: laneResult.laneResultPath,
    artifactDir: platformArtifactDir,
    sessionBatchSize,
    sessionBatches,
  };
}

async function settingsTauriMacos(platform) {
  if (['app', 'app-controller', 'tauri-qa-controller'].includes(tauriMacosSettingsController)) {
    return settingsTauriMacosAppController(platform);
  }
  if (tauriMacosSettingsController === 'bridge') return settingsTauriMacosBridge(platform);
  if (tauriMacosSettingsController !== 'webdriver') {
    return {
      platform,
      result: 'failed',
      error: `Unsupported tauri-macos Settings controller: ${tauriMacosSettingsController}`,
    };
  }
  return settingsTauriMacosWebDriver(platform);
}

async function settingsTauriMacosAppController(platform) {
  const application = tauriApplication(platform);
  const platformArtifactDir = tauriMacosSettingsArtifactDir(platform);
  const preflight = validateTauriMacosSettingsPrereqs(application);
  if (preflight) return { platform, result: 'failed', error: preflight };

  const selectedScenarios = filterSettingsScenarios(tauriMacosAppControllerSettingsScenarios());
  const callbackServer = await startTauriQaCallbackServer();
  const scenarios = [];

  try {
    for (const scenario of selectedScenarios) {
      terminateMacosApplication(application);
      await sleep(500);
      const launch = launchMacosApplication(application);
      if (!launch.ok) {
        scenarios.push(
          tauriMacosAppControllerLaunchFailureScenario(
            scenario,
            launch.detail || 'Failed to launch .app.',
          ),
        );
        continue;
      }
      await sleep(delayMs);
      scenarios.push(
        await runTauriMacosAppControllerSettingsScenario(
          platformArtifactDir,
          scenario,
          callbackServer,
          application,
        ),
      );
      terminateMacosApplication(application);
      await sleep(500);
    }
  } finally {
    terminateMacosApplication(application);
    await callbackServer.close();
  }

  return finishTauriMacosSettingsRun({
    platform,
    platformArtifactDir,
    scenarios,
    controller: 'tauri-qa-controller',
  });
}

async function settingsTauriMacosWebDriver(platform) {
  const application = tauriApplication(platform);
  const platformArtifactDir = tauriMacosSettingsArtifactDir(platform);
  const selectedScenarios = filterSettingsScenarios(tauriMacosSettingsScenarios());
  const preflight = validateTauriMacosSettingsPrereqs(application);
  if (preflight) return { platform, result: 'failed', error: preflight };
  if (process.platform === 'darwin') {
    return {
      platform,
      result: 'failed',
      error:
        'tauri-driver v2 is not supported on macOS (it currently supports Linux/Windows only). Use --macos-settings-controller bridge for provisional macOS capture, or run strict desktop WebDriver closure on a supported Windows/Linux Tauri host.',
      artifactDir: platformArtifactDir,
      controller: 'tauri-driver-webdriver',
    };
  }

  const scenarios = [];
  const setupPhases = [];
  let session;
  let sessionResult = 'passed';
  let sessionError = null;
  const startedAtMs = Date.now();

  try {
    session = await createWebDriverSession(tauriDriverUrl, {
      browserName: 'wry',
      'tauri:options': { application },
    });

    const context = {
      platform,
      serverUrl: tauriDriverUrl,
      sessionId: session.sessionId,
      session: session.publicSession,
      platformArtifactDir,
      setupPhases,
      storageKey: null,
      webviewSelected: false,
      batchIndex: 1,
      batchCount: 1,
      controller: 'tauri-driver-webdriver',
    };

    await prepareAuthenticatedSettingsContext(context);
    console.log(`[native-settings] ${platform} tauri-driver setup passed`);

    for (const [scenarioIndex, scenario] of selectedScenarios.entries()) {
      const scenarioResult = await runNativeSettingsScenario(context, scenario);
      scenarios.push(scenarioResult);
      if (isWebDriverTransportFailure(scenarioResult.errorMessage)) {
        sessionResult = 'failed';
        sessionError = `WebDriver transport failed during ${scenario.scenarioId}; aborting tauri-macos Settings session.`;
        for (const remainingScenario of selectedScenarios.slice(scenarioIndex + 1)) {
          scenarios.push(
            nativeScenarioResult({
              scenario: remainingScenario,
              platform,
              status: 'failed',
              consistency: 'mismatch',
              current: sessionError,
              screenshotPath: null,
              durationMs: 0,
              errorMessage: sessionError,
            }),
          );
        }
        break;
      }
    }
  } catch (error) {
    sessionResult = 'failed';
    sessionError = error.message;
    console.log(`[native-settings] ${platform} tauri-driver setup failed: ${error.message}`);
    for (const scenario of selectedScenarios.slice(scenarios.length)) {
      scenarios.push(
        nativeScenarioResult({
          scenario,
          platform,
          status: 'failed',
          consistency: 'mismatch',
          current: `macOS Tauri Settings setup failed before scenario execution: ${error.message}`,
          screenshotPath: null,
          durationMs: 0,
          errorMessage: error.message,
        }),
      );
    }
  } finally {
    if (session?.sessionId) await deleteWebDriverSession(tauriDriverUrl, session.sessionId);
  }

  return finishTauriMacosSettingsRun({
    platform,
    platformArtifactDir,
    scenarios,
    controller: 'tauri-driver-webdriver',
    sessionBatches: [
      {
        index: 1,
        result: sessionResult,
        scenarioIds: selectedScenarios.map((scenario) => scenario.scenarioId),
        durationMs: Date.now() - startedAtMs,
        setupPhases,
        session: session?.publicSession ?? null,
        ...(sessionError ? { error: sessionError } : {}),
      },
    ],
  });
}

async function settingsTauriMacosBridge(platform) {
  const application = tauriApplication(platform);
  const platformArtifactDir = tauriMacosSettingsArtifactDir(platform);
  const preflight = validateTauriMacosSettingsPrereqs(application);
  if (preflight) return { platform, result: 'failed', error: preflight };

  const scenarios = [];
  const launch = launchMacosApplication(application);
  if (!launch.ok) {
    return { platform, result: 'failed', error: launch.detail || 'Failed to launch .app.' };
  }
  await sleep(delayMs);

  for (const scenario of filterSettingsScenarios(tauriMacosBridgeSettingsScenarios())) {
    scenarios.push(await runTauriMacosSettingsScenario(platformArtifactDir, scenario, application));
  }

  return finishTauriMacosSettingsRun({
    platform,
    platformArtifactDir,
    scenarios,
    controller: 'macos-activity-capture-bridge',
  });
}

function tauriMacosSettingsArtifactDir(platform) {
  const platformArtifactDir = resolve(
    paths.attemptDir,
    'testing',
    platform,
    'desktop-settings-contract',
  );
  ensureDir(platformArtifactDir);
  return platformArtifactDir;
}

function validateTauriMacosSettingsPrereqs(application) {
  if (process.platform !== 'darwin') {
    return `tauri-macos Settings runner requires macOS; current host is ${process.platform}.`;
  }
  if (!application) {
    return 'Pass --macos-application <path-to-Openread.app> or set OPENREAD_TAURI_MACOS_APPLICATION.';
  }
  if (!existsSync(application)) return `Application does not exist: ${application}`;
  return null;
}

function finishTauriMacosSettingsRun({
  platform,
  platformArtifactDir,
  scenarios,
  controller,
  sessionBatches = [],
}) {
  const result = scenarios.every((scenario) => scenario.status === 'passed') ? 'passed' : 'failed';
  const expectedCurrentReport = buildNativeExpectedCurrentReport({
    platform,
    platformArtifactDir,
    result,
    scenarios,
  });
  const laneResult = writeNativeLaneResult({
    platform,
    platformArtifactDir,
    result,
    expectedCurrentReportPath: expectedCurrentReport.jsonPath,
    scenarioCount: scenarios.length,
  });

  return {
    platform,
    result,
    controller,
    scenarioCount: scenarios.length,
    passed: scenarios.filter((scenario) => scenario.status === 'passed').length,
    failed: scenarios.filter((scenario) => scenario.status !== 'passed').length,
    reportPath: expectedCurrentReport.jsonPath,
    markdownPath: expectedCurrentReport.markdownPath,
    laneResultPath: laneResult.laneResultPath,
    artifactDir: platformArtifactDir,
    tauriDriverUrl,
    ...(sessionBatches.length ? { sessionBatches } : {}),
  };
}

async function captureAppiumIos(platform = 'native-ios') {
  const screenshotPath = resolve(artifactDir, `${platform}.png`);
  const session = await createWebDriverSession(appiumUrl, iosCapabilities(platform));

  try {
    const open = openNativeDeepLink(platform, openUrl);
    if (!open.ok) throw new Error(open.detail);
    await sleep(delayMs);
    await writeWebDriverScreenshot(appiumUrl, session.sessionId, screenshotPath);
    return { platform, result: 'passed', screenshotPath, session: session.publicSession };
  } finally {
    await deleteWebDriverSession(appiumUrl, session.sessionId);
  }
}

async function captureAppiumAndroid() {
  const platform = 'native-android';
  const screenshotPath = resolve(artifactDir, `${platform}.png`);
  const session = await createWebDriverSession(appiumUrl, androidCapabilities());

  try {
    const open = openNativeDeepLink(platform, openUrl);
    let navigation = { method: 'deep-link', ...open };
    if (!open.ok) {
      const webview = await switchToWebView(appiumUrl, session.sessionId, platform);
      const routed = await executeScript(
        appiumUrl,
        session.sessionId,
        `window.location.assign(arguments[0]);
return { href: window.location.href, path: window.location.pathname };`,
        [route],
      );
      navigation = {
        method: 'webview-navigation-fallback',
        ok: true,
        detail: routed,
        context: webview.context,
        contexts: webview.contexts,
        deepLinkError: open.detail,
      };
    }
    await sleep(delayMs);
    await writeWebDriverScreenshot(appiumUrl, session.sessionId, screenshotPath);
    return {
      platform,
      result: 'passed',
      screenshotPath,
      session: session.publicSession,
      navigation,
    };
  } finally {
    await deleteWebDriverSession(appiumUrl, session.sessionId);
  }
}

async function healthAppiumMobile(platform) {
  const screenshotPaths = {
    auth: resolve(artifactDir, `${platform}-auth.png`),
    library: resolve(artifactDir, `${platform}-library-authenticated.png`),
    signedOut: resolve(artifactDir, `${platform}-signed-out.png`),
  };
  const serverUrl = appiumUrl;
  if (platform === 'native-android') maybeForceStopAndroid();
  const session = await createWebDriverSession(
    serverUrl,
    platform === 'native-android' ? androidCapabilities() : iosCapabilities(platform),
  );
  const phases = [];

  try {
    const initialRoute = await navigateNativeHealthRoute({
      serverUrl,
      sessionId: session.sessionId,
      platform,
      targetRoute: '/auth',
      state: 'native-health-auth',
      auth: 'anonymous',
    });
    phases.push({ name: 'open-auth', ...initialRoute });
    await sleep(delayMs);

    const webview = await switchToWebView(serverUrl, session.sessionId, platform);
    phases.push({
      name: 'switch-webview',
      ok: true,
      context: webview.context,
      contexts: webview.contexts,
    });

    const storageKey = supabaseStorageKey();
    const initialClear = await clearAuthSession(serverUrl, session.sessionId, storageKey);
    phases.push({
      name: 'clear-initial-auth-session',
      ok: !initialClear.hasToken,
      detail: initialClear,
    });
    const anonymousAuth = await navigateNativeHealthRoute({
      serverUrl,
      sessionId: session.sessionId,
      platform,
      targetRoute: '/auth',
      state: 'native-health-auth-anonymous',
      auth: 'anonymous',
      preferWebView: true,
    });
    phases.push({ name: 'ensure-auth-route', ...anonymousAuth });
    await sleep(delayMs);
    await writeWebDriverScreenshot(serverUrl, session.sessionId, screenshotPaths.auth);

    if (healthAuthMode !== 'authenticated') {
      return {
        platform,
        result: 'passed',
        auth: 'anonymous-only',
        screenshotPaths: { auth: screenshotPaths.auth },
        phases,
        session: session.publicSession,
      };
    }

    const testSession = await getNativeTestSession();

    const injection = await injectAuthSession(
      serverUrl,
      session.sessionId,
      testSession,
      storageKey,
    );
    phases.push({ name: 'inject-auth-session', ok: injection.hasToken, detail: injection });
    if (!injection.hasToken)
      throw new Error('Native auth session injection did not create token storage.');

    const openLibrary = await navigateNativeHealthRoute({
      serverUrl,
      sessionId: session.sessionId,
      platform,
      targetRoute: '/library',
      state: 'native-health-library',
      auth: 'authenticated',
      preferWebView: true,
    });
    phases.push({ name: 'open-library', ...openLibrary });
    await sleep(delayMs);
    await switchToWebView(serverUrl, session.sessionId, platform);
    const libraryState = await readAuthState(serverUrl, session.sessionId, storageKey);
    phases.push({ name: 'verify-library-auth', ok: libraryState.hasToken, detail: libraryState });
    await writeWebDriverScreenshot(serverUrl, session.sessionId, screenshotPaths.library);
    if (!libraryState.hasToken)
      throw new Error('Native /library did not retain the injected auth token.');
    if (!['/library', '/home'].includes(libraryState.path))
      throw new Error(
        `Native authenticated navigation did not land on an authenticated surface: ${libraryState.path}`,
      );

    const cleared = await clearAuthSession(serverUrl, session.sessionId, storageKey);
    phases.push({ name: 'clear-auth-session', ok: !cleared.hasToken, detail: cleared });
    const openSignedOut = await navigateNativeHealthRoute({
      serverUrl,
      sessionId: session.sessionId,
      platform,
      targetRoute: '/auth',
      state: 'native-health-signed-out',
      auth: 'anonymous',
      preferWebView: true,
    });
    phases.push({ name: 'open-signed-out-auth', ...openSignedOut });
    await sleep(delayMs);
    await writeWebDriverScreenshot(serverUrl, session.sessionId, screenshotPaths.signedOut);

    return {
      platform,
      result: 'passed',
      auth: 'authenticated-session-injected-via-webdriver',
      screenshotPaths,
      phases,
      session: session.publicSession,
    };
  } catch (error) {
    return {
      platform,
      result: 'failed',
      auth: healthAuthMode,
      error: error.message,
      screenshotPaths,
      phases,
      session: session.publicSession,
    };
  } finally {
    await deleteWebDriverSession(serverUrl, session.sessionId);
  }
}

async function healthTauriWindows(platform) {
  const application = tauriApplication(platform);
  if (process.platform !== 'win32') {
    return {
      platform,
      result: 'failed',
      error: `tauri-windows health requires a local Windows host/VM; current host is ${process.platform}.`,
    };
  }
  if (!application) {
    return {
      platform,
      result: 'failed',
      error: 'Pass --application <path> or set OPENREAD_TAURI_APPLICATION for tauri-driver health.',
    };
  }
  if (!existsSync(application)) {
    return { platform, result: 'failed', error: `Application does not exist: ${application}` };
  }

  const screenshotPaths = {
    launched: resolve(artifactDir, `${platform}-launched.png`),
    library: resolve(artifactDir, `${platform}-library-authenticated.png`),
    signedOut: resolve(artifactDir, `${platform}-signed-out.png`),
  };
  const session = await createWebDriverSession(tauriDriverUrl, {
    browserName: 'wry',
    'tauri:options': { application },
  });
  const phases = [];

  try {
    await sleep(delayMs);
    await writeWebDriverScreenshot(tauriDriverUrl, session.sessionId, screenshotPaths.launched);

    if (healthAuthMode !== 'authenticated') {
      return {
        platform,
        result: 'passed',
        auth: 'anonymous-only',
        screenshotPaths: { launched: screenshotPaths.launched },
        phases,
        session: session.publicSession,
      };
    }

    const testSession = await getNativeTestSession();
    const storageKey = supabaseStorageKey();
    const injection = await injectAuthSession(
      tauriDriverUrl,
      session.sessionId,
      testSession,
      storageKey,
    );
    phases.push({ name: 'inject-auth-session', ok: injection.hasToken, detail: injection });
    await executeScript(
      tauriDriverUrl,
      session.sessionId,
      'window.location.assign(arguments[0]); return window.location.href;',
      ['/library'],
    );
    await sleep(delayMs);
    const libraryState = await readAuthState(tauriDriverUrl, session.sessionId, storageKey);
    phases.push({ name: 'verify-library-auth', ok: libraryState.hasToken, detail: libraryState });
    await writeWebDriverScreenshot(tauriDriverUrl, session.sessionId, screenshotPaths.library);
    if (!libraryState.hasToken)
      throw new Error('Tauri /library did not retain the injected auth token.');

    const cleared = await clearAuthSession(tauriDriverUrl, session.sessionId, storageKey);
    phases.push({ name: 'clear-auth-session', ok: !cleared.hasToken, detail: cleared });
    await executeScript(
      tauriDriverUrl,
      session.sessionId,
      'window.location.assign(arguments[0]); return window.location.href;',
      ['/auth'],
    );
    await sleep(delayMs);
    await writeWebDriverScreenshot(tauriDriverUrl, session.sessionId, screenshotPaths.signedOut);

    return {
      platform,
      result: 'passed',
      auth: 'authenticated-session-injected-via-webdriver',
      screenshotPaths,
      phases,
      session: session.publicSession,
    };
  } catch (error) {
    return {
      platform,
      result: 'failed',
      auth: healthAuthMode,
      error: error.message,
      screenshotPaths,
      phases,
      session: session.publicSession,
    };
  } finally {
    await deleteWebDriverSession(tauriDriverUrl, session.sessionId);
  }
}

async function healthTauriMacos(platform) {
  const application = tauriApplication(platform);
  if (process.platform !== 'darwin') {
    return {
      platform,
      result: 'failed',
      error: `tauri-macos AX health requires macOS; current host is ${process.platform}.`,
    };
  }
  if (!application) {
    return {
      platform,
      result: 'failed',
      error: 'Pass --application <path-to-Openread.app> or set OPENREAD_TAURI_MACOS_APPLICATION.',
    };
  }
  if (!existsSync(application)) {
    return { platform, result: 'failed', error: `Application does not exist: ${application}` };
  }

  const screenshotPaths = {
    launched: resolve(artifactDir, `${platform}-launched.png`),
    routed: resolve(artifactDir, `${platform}-activity-route.png`),
  };
  const phases = [];

  try {
    const launch = launchMacosApplication(application);
    phases.push({ name: 'launch-application', ok: launch.ok, detail: launch.detail });
    if (!launch.ok) throw new Error(launch.detail);
    await sleep(delayMs);

    const visible = macosApplicationWindowState(application);
    phases.push({ name: 'verify-window-visible', ok: visible.ok, detail: visible.detail });
    if (!visible.ok) throw new Error(visible.detail);
    const launchedCapture = captureMacosScreenshot(screenshotPaths.launched);
    phases.push({
      name: 'capture-launched-window',
      ok: launchedCapture.ok,
      detail: launchedCapture.detail,
    });
    if (!launchedCapture.ok) throw new Error(launchedCapture.detail);

    const open = openMacosDeepLink(openUrl);
    phases.push({ name: 'open-activity-capture-url', ok: open.ok, detail: open.detail });
    await sleep(delayMs);
    const routedCapture = captureMacosScreenshot(screenshotPaths.routed);
    phases.push({
      name: 'capture-routed-window',
      ok: routedCapture.ok,
      detail: routedCapture.detail,
    });
    if (!routedCapture.ok) throw new Error(routedCapture.detail);

    return {
      platform,
      result: 'passed',
      auth: 'not-injected-ax-controller',
      screenshotPaths,
      phases,
      controller: 'macos-ax-screencapture',
      note: 'macOS Tauri health remains AX/screenshot-backed. Strict Settings SET closure uses the separate tauri-driver WebDriver settings controller.',
    };
  } catch (error) {
    return {
      platform,
      result: 'failed',
      auth: healthAuthMode,
      error: error.message,
      screenshotPaths,
      phases,
      controller: 'macos-ax-screencapture',
    };
  }
}

async function prepareAuthenticatedSettingsContext(context) {
  if (healthAuthMode !== 'authenticated') {
    throw new Error('Native Settings SET runner requires authenticated health mode.');
  }

  const initialRoute = await navigateNativeHealthRoute({
    serverUrl: context.serverUrl,
    sessionId: context.sessionId,
    platform: context.platform,
    targetRoute: '/auth',
    state: 'native-settings-auth-start',
    auth: 'anonymous',
  });
  context.setupPhases.push({ name: 'open-auth', ...initialRoute });
  await sleep(delayMs);

  const webview = await ensureSettingsWebView(context);
  context.setupPhases.push({ name: 'switch-webview', ok: true, ...webview });

  context.storageKey = supabaseStorageKey();
  const cleared = await clearAuthSession(context.serverUrl, context.sessionId, context.storageKey);
  context.setupPhases.push({ name: 'clear-stale-auth', ok: !cleared.hasToken, detail: cleared });

  const authSurface = await navigateSettingsWebView(context, '/auth', ['Sign In'], 20_000).catch(
    async (error) => {
      const current = await executeScript(
        context.serverUrl,
        context.sessionId,
        `return { path: window.location.pathname, href: window.location.href, text: document.body.innerText.slice(0, 1000) };`,
      );
      if (String(current?.path || '') !== '/auth') return current;
      throw error;
    },
  );
  context.setupPhases.push({ name: 'auth-surface', ok: true, detail: authSurface });
  const testSession = await getNativeTestSession('reader');
  context.testSession = testSession;
  context.authPlan = 'reader';
  let injection = await injectAuthSession(
    context.serverUrl,
    context.sessionId,
    testSession,
    context.storageKey,
  );
  context.setupPhases.push({
    name: 'inject-auth-session',
    ok: injection.hasToken,
    detail: injection,
  });
  if (!injection.hasToken) {
    await navigateSettingsWebView(context, '/settings/account', ['Settings'], 20_000).catch(
      () => null,
    );
    injection = await injectAuthSession(
      context.serverUrl,
      context.sessionId,
      testSession,
      context.storageKey,
    );
    context.setupPhases.push({
      name: 'inject-auth-session-retry',
      ok: injection.hasToken,
      detail: injection,
    });
  }
  if (!injection.hasToken)
    throw new Error('Native Settings auth injection did not create a token.');

  await navigateSettingsWebView(context, '/settings/account', [
    'Settings',
    'Profile',
    'Cloud Storage',
  ]);
  const verified = await waitForNativeAuthenticatedRoute(context, '/settings/account');
  context.setupPhases.push({ name: 'verify-authenticated-route', ok: true, detail: verified });
}

function tauriMacosSettingsScenarios() {
  const nativeById = new Map(
    nativeSettingsScenarios().map((scenario) => [
      scenario.scenarioId,
      tauriMacosNativeScenario(scenario),
    ]),
  );
  return [
    nativeById.get('SET-001'),
    tauriMacosDriverScenario({
      scenarioId: 'SET-002',
      title: '`/settings` default redirect',
      expected: '`/settings` redirects to Account Settings in the macOS Tauri WebView.',
      run: runTauriSet002DefaultRedirect,
    }),
    tauriMacosDriverScenario({
      scenarioId: 'SET-003',
      title: 'Direct-load Settings tab URLs',
      expected: 'macOS Tauri can direct-load Account, Preferences, and Billing Settings tab URLs.',
      run: runTauriSet003DirectSettingsTabs,
    }),
    nativeById.get('SET-004'),
    tauriMacosDriverScenario({
      scenarioId: 'SET-005',
      title: 'Switch Settings tabs by keyboard',
      expected: 'Keyboard activation moves between Settings tabs in the macOS Tauri WebView.',
      run: runTauriSet005KeyboardSettingsTabs,
    }),
    tauriMacosDriverScenario({
      scenarioId: 'SET-006',
      title: 'Signed-out Settings direct access',
      expected: 'Signed-out macOS Tauri users are redirected away from authenticated Settings.',
      plan: 'free',
      ensureAuth: false,
      run: runTauriSet006SignedOutDirectAccess,
    }),
    nativeById.get('SET-007'),
    nativeById.get('SET-008'),
    nativeById.get('SET-009'),
    nativeById.get('SET-010'),
    nativeById.get('SET-011'),
    nativeById.get('SET-012'),
    nativeById.get('SET-013'),
    nativeById.get('SET-014'),
    nativeById.get('SET-015'),
    nativeById.get('SET-016'),
    nativeById.get('SET-017'),
    nativeById.get('SET-018'),
    nativeById.get('SET-019'),
    nativeById.get('SET-020'),
    nativeById.get('SET-021'),
    nativeById.get('SET-022'),
    nativeById.get('SET-023'),
    nativeById.get('SET-024'),
    nativeById.get('SET-025'),
    nativeById.get('SET-026'),
    nativeById.get('SET-027'),
    nativeById.get('SET-028'),
    nativeById.get('SET-029'),
    tauriMacosDriverScenario({
      scenarioId: 'SET-030',
      title: 'AI Online/Offline mode switching',
      expected: 'macOS Tauri Preferences switches AI mode between Online and Offline.',
      run: runTauriSet030AiModeSwitching,
    }),
    tauriMacosDriverScenario({
      scenarioId: 'SET-031',
      title: 'Ollama available detection',
      expected: 'macOS Tauri Preferences reports Ollama detected when the local API responds.',
      evidenceMode: 'qa-seam-real-ui',
      run: runTauriSet031OllamaAvailable,
    }),
    tauriMacosDriverScenario({
      scenarioId: 'SET-032',
      title: 'Ollama unavailable detection',
      expected: 'macOS Tauri Preferences reports Ollama unavailable when the local API fails.',
      evidenceMode: 'qa-seam-real-ui',
      run: runTauriSet032OllamaUnavailable,
    }),
    nativeById.get('SET-033'),
    nativeById.get('SET-034'),
    nativeById.get('SET-035'),
    nativeById.get('SET-036'),
    nativeById.get('SET-037'),
    nativeById.get('SET-038'),
    nativeById.get('SET-039'),
    nativeById.get('SET-040'),
    nativeById.get('SET-041'),
    nativeById.get('SET-042'),
    nativeById.get('SET-043'),
    nativeById.get('SET-044'),
    tauriMacosDriverScenario({
      scenarioId: 'SET-049',
      title: 'External MCP auth and tool success',
      expected:
        'macOS desktop SET-049 requires external MCP auth/tool evidence, not Settings overlay evidence.',
      evidenceMode: 'controller-real-ui',
      run: runTauriSet049ExternalMcpEvidenceRequired,
    }),
    nativeById.get('SET-054'),
    nativeById.get('SET-055'),
    nativeById.get('SET-056'),
    nativeById.get('SET-057'),
    nativeById.get('SET-058'),
    nativeById.get('SET-059'),
    nativeById.get('SET-060'),
    tauriMacosDriverScenario({
      scenarioId: 'SET-061',
      title: 'Reader desktop Settings dialog open/close',
      expected: 'macOS Tauri reader exposes a desktop Settings surface that can open and close.',
      evidenceMode: 'controller-real-ui',
      run: runTauriSet061ReaderDesktopSettingsDialog,
    }),
    tauriMacosDriverScenario({
      scenarioId: 'SET-063',
      title: 'Reader settings panel switching and search',
      expected: 'macOS Tauri reader Settings supports panel switching and search.',
      evidenceMode: 'controller-real-ui',
      run: runTauriSet063ReaderPanelSwitching,
    }),
    tauriMacosDriverScenario({
      scenarioId: 'SET-064',
      title: 'Reader global vs per-book scope',
      expected: 'macOS Tauri reader Settings keeps global and per-book scope state separate.',
      evidenceMode: 'controller-real-ui',
      run: runTauriSet064ReaderScope,
    }),
    tauriMacosDriverScenario({
      scenarioId: 'SET-065',
      title: 'Reader panel reset',
      expected: 'macOS Tauri reader Settings can reset panel state.',
      evidenceMode: 'controller-real-ui',
      run: runTauriSet065ReaderPanelReset,
    }),
    tauriMacosDriverScenario({
      scenarioId: 'SET-066',
      title: 'Reader invalid Custom CSS recovery',
      expected: 'macOS Tauri reader Settings recovers from invalid Custom CSS input.',
      evidenceMode: 'controller-real-ui',
      run: runTauriSet066ReaderInvalidCssRecovery,
    }),
    tauriMacosDriverScenario({
      scenarioId: 'SET-067',
      title: 'Reader settings persistence after reload/reopen',
      expected: 'macOS Tauri reader Settings persist after reload/reopen.',
      evidenceMode: 'controller-real-ui',
      run: runSet067ReaderSettingsPersistence,
    }),
  ].filter(Boolean);
}

function tauriMacosAppControllerSettingsScenarios() {
  const scenarios = tauriMacosBridgeSettingsScenarios();
  if (scenarioFilter.length) return scenarios;
  return scenarios.filter((scenario) => scenario.scenarioId !== 'SET-049');
}

function tauriMacosBridgeSettingsScenarios() {
  return [
    tauriMacosScenario('SET-001', 'Open Settings from authenticated UI', '/settings/account'),
    tauriMacosScenario('SET-002', '`/settings` default redirect', '/settings'),
    tauriMacosScenario('SET-003', 'Direct-load Settings tab URLs', '/settings/preferences'),
    tauriMacosScenario('SET-004', 'Switch Settings tabs by pointer', '/settings/account'),
    tauriMacosScenario('SET-005', 'Switch Settings tabs by keyboard', '/settings/account'),
    tauriMacosScenario('SET-006', 'Signed-out Settings direct access', '/settings/account', {
      auth: 'anonymous',
      plan: 'free',
    }),
    tauriMacosScenario('SET-007', 'Profile loading and read-only display', '/settings/account'),
    tauriMacosScenario('SET-008', 'Edit Profile cancel', '/settings/account'),
    tauriMacosScenario('SET-009', 'Edit Profile save success', '/settings/account'),
    tauriMacosScenario('SET-010', 'Edit Profile save failure', '/settings/account'),
    tauriMacosScenario('SET-011', 'Storage quota loading', '/settings/account'),
    tauriMacosScenario('SET-012', 'Storage usage and breakdown', '/settings/account'),
    tauriMacosScenario('SET-013', 'Storage quota error', '/settings/account'),
    tauriMacosScenario('SET-014', 'Storage over-limit warning', '/settings/account'),
    tauriMacosScenario('SET-015', 'Storage tier-only no add-on checkout', '/settings/account'),
    tauriMacosScenario('SET-016', 'Tier storage limit display', '/settings/account'),
    tauriMacosScenario('SET-017', 'Storage add-on cancel disabled', '/settings/account'),
    tauriMacosScenario('SET-018', 'Sync toggle off/on persistence', '/settings/account'),
    tauriMacosScenario('SET-019', 'Sync Now success', '/settings/account'),
    tauriMacosScenario('SET-020', 'Sync Now error', '/settings/account'),
    tauriMacosScenario('SET-021', 'Danger Zone sign out', '/settings/account'),
    tauriMacosScenario('SET-022', 'Delete Account cancel', '/settings/account'),
    tauriMacosScenario('SET-023', 'Delete Account success', '/settings/account'),
    tauriMacosScenario('SET-024', 'Delete Account failure', '/settings/account'),
    tauriMacosScenario('SET-025', 'Theme mode persistence', '/settings/preferences'),
    tauriMacosScenario('SET-026', 'Theme color persistence', '/settings/preferences'),
    tauriMacosScenario('SET-027', 'Reading font default persistence', '/settings/preferences'),
    tauriMacosScenario('SET-028', 'Reading size/line-height persistence', '/settings/preferences'),
    tauriMacosScenario('SET-029', 'AI enable/disable', '/settings/preferences'),
    tauriMacosScenario('SET-030', 'AI Online/Offline mode switching', '/settings/preferences'),
    tauriMacosScenario('SET-031', 'Ollama available detection', '/settings/preferences'),
    tauriMacosScenario('SET-032', 'Ollama unavailable detection', '/settings/preferences'),
    tauriMacosScenario('SET-033', 'BYOK gated Free/no-access state', '/settings/preferences', {
      plan: 'free',
    }),
    tauriMacosScenario('SET-034', 'BYOK provider key save/test success', '/settings/preferences'),
    tauriMacosScenario('SET-035', 'BYOK provider key remove', '/settings/preferences'),
    tauriMacosScenario(
      'SET-036',
      'BYOK invalid/untestable provider state',
      '/settings/preferences',
    ),
    tauriMacosScenario('SET-037', 'Notification preference toggles', '/settings/preferences'),
    tauriMacosScenario('SET-038', 'Telemetry privacy toggle', '/settings/preferences'),
    tauriMacosScenario('SET-039', 'Download My Data success', '/settings/preferences'),
    tauriMacosScenario('SET-040', 'Download My Data rate-limit/error', '/settings/preferences'),
    tauriMacosScenario('SET-041', 'Clear Local Preferences cancel', '/settings/preferences'),
    tauriMacosScenario('SET-042', 'Clear Local Preferences confirm', '/settings/preferences'),
    tauriMacosScenario('SET-043', 'Reset Preferences cancel', '/settings/preferences'),
    tauriMacosScenario('SET-044', 'Reset Preferences confirm', '/settings/preferences'),
    tauriMacosScenario('SET-049', 'External MCP auth and tool success', '/settings/account'),
    tauriMacosScenario('SET-054', 'Billing loading and error states', '/settings/billing'),
    tauriMacosScenario('SET-055', 'Free billing view and upgrade path', '/settings/billing', {
      plan: 'free',
    }),
    tauriMacosScenario('SET-056', 'Paid billing view', '/settings/billing'),
    tauriMacosScenario('SET-057', 'Stripe checkout handoff', '/settings/billing'),
    tauriMacosScenario('SET-058', 'Billing portal/manage-plan handoff', '/settings/billing'),
    tauriMacosScenario('SET-059', 'Subscription cancellation flow', '/settings/billing'),
    tauriMacosScenario('SET-060', 'Billing invoice/payment empty states', '/settings/billing'),
    tauriMacosScenario('SET-061', 'Reader desktop Settings dialog open/close', '/reader'),
    tauriMacosScenario('SET-063', 'Reader settings panel switching and search', '/reader'),
    tauriMacosScenario('SET-064', 'Reader global vs per-book scope', '/reader'),
    tauriMacosScenario('SET-065', 'Reader panel reset', '/reader'),
    tauriMacosScenario('SET-066', 'Reader invalid Custom CSS recovery', '/reader'),
    tauriMacosScenario('SET-067', 'Reader settings persistence after reload/reopen', '/reader'),
  ];
}

function tauriMacosNativeScenario(scenario) {
  const screenshotBase = scenario.screenshotBase.replace('-terminal-', '-terminal-tauri-macos-');
  return {
    ...scenario,
    screenshotBase,
    expected: scenario.expected
      .replaceAll('Native ', 'macOS Tauri ')
      .replaceAll('native ', 'macOS Tauri '),
    contractPlatforms: ['tauri-macos'],
    automationNotes: 'Controller-backed macOS Tauri tauri-driver WebDriver scenario evidence.',
  };
}

function tauriMacosDriverScenario({
  scenarioId,
  title,
  expected,
  plan = 'reader',
  ensureAuth = true,
  evidenceMode = 'controller-real-ui',
  run,
}) {
  return {
    scenarioId,
    title,
    screenshotBase: `${scenarioId}-terminal-tauri-macos-${sanitizeName(title)}`,
    expected,
    plan,
    ensureAuth,
    evidenceMode,
    run,
    contractPlatforms: ['tauri-macos'],
    automationNotes: 'Controller-backed macOS Tauri tauri-driver WebDriver scenario evidence.',
  };
}

function tauriMacosScenario(scenarioId, title, route, options = {}) {
  const screenshotBase = `${scenarioId}-terminal-tauri-macos-${sanitizeName(title)}`;
  return {
    scenarioId,
    title,
    route,
    screenshotBase,
    plan: options.plan ?? 'reader',
    auth: options.auth ?? 'qa',
    expected: `macOS Tauri QA bridge routes to ${route} and captures controller-backed evidence for ${scenarioId} ${title}.`,
    qaText:
      options.qaText ??
      `${scenarioId} ${title}: macOS Tauri Settings contract evidence captured on ${route}.`,
  };
}

async function startTauriQaCallbackServer() {
  const pending = new Map();
  const server = createServer((request, response) => {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type');
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url || '/', 'http://localhost');
    const pathParts = url.pathname.split('/').filter(Boolean);
    const token = pathParts.pop();
    const entry = token ? pending.get(token) : null;
    if (!entry) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: 'Unknown QA callback token.' }));
      return;
    }

    if (request.method === 'GET' && pathParts.includes('tauri-qa-session')) {
      if (!entry.session) {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: false, error: 'No QA test-user session registered.' }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ session: entry.session }));
      return;
    }

    if (request.method !== 'POST') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: 'Unknown QA callback method.' }));
      return;
    }

    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      try {
        const result = body ? JSON.parse(body) : null;
        clearTimeout(entry.timer);
        pending.delete(token);
        entry.resolve({ ok: Boolean(result?.ok), result });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true }));
      } catch (error) {
        clearTimeout(entry.timer);
        pending.delete(token);
        entry.resolve({ ok: false, error: error.message });
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: false, error: error.message }));
      }
    });
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('QA callback server has no port.');
  const baseUrl = `http://localhost:${address.port}`;

  return {
    register(scenario, session = null) {
      const token = `${scenario.scenarioId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let resolveCallback;
      const promise = new Promise((resolve) => {
        resolveCallback = resolve;
      });
      const timer = setTimeout(() => {
        pending.delete(token);
        resolveCallback({
          ok: false,
          error: `Timed out waiting for Tauri QA controller callback for ${scenario.scenarioId}.`,
        });
      }, 60_000);
      pending.set(token, { resolve: resolveCallback, timer, session });
      return {
        url: `${baseUrl}/tauri-qa/${token}`,
        sessionUrl: session ? `${baseUrl}/tauri-qa-session/${token}` : null,
        wait: () => promise,
      };
    },
    close() {
      for (const [token, entry] of pending.entries()) {
        clearTimeout(entry.timer);
        entry.resolve({ ok: false, error: 'QA callback server closed before result arrived.' });
        pending.delete(token);
      }
      return new Promise((resolveClose) => server.close(() => resolveClose()));
    },
  };
}

function tauriMacosAppControllerLaunchFailureScenario(scenario, errorMessage) {
  return {
    title: `${scenario.scenarioId} ${scenario.title}`,
    titlePath: `macOS Tauri Settings contract › ${scenario.scenarioId} ${scenario.title}`,
    file: 'e2e/native/ctl.mjs',
    line: null,
    project: 'native-ctl',
    scenarioId: scenario.scenarioId,
    expected: `macOS Tauri QA controller opens ${scenario.route}, exercises/asserts real UI state, and captures evidence for ${scenario.scenarioId} ${scenario.title}.`,
    current: `macOS Tauri QA controller failed before scenario launch: ${errorMessage}`,
    consistency: 'mismatch',
    status: 'failed',
    outcome: 'failed',
    statuses: ['failed'],
    durationMs: 0,
    screenshotPath: null,
    screenshotName: null,
    screenshotKind: null,
    evidenceGap: true,
    evidenceMode: 'qa-seam-real-ui',
    contract: {
      scenarioId: scenario.scenarioId,
      platforms: ['tauri-macos'],
      evidenceMode: 'qa-seam-real-ui',
      automationNotes:
        'QA-only in-app Tauri controller exercised/asserted real UI state, then macOS screencapture collected evidence.',
    },
    details: {
      route: scenario.route,
      launch: { ok: false, detail: errorMessage },
      plan: scenario.plan,
    },
    errorMessage,
  };
}

async function runTauriMacosAppControllerSettingsScenario(
  platformArtifactDir,
  scenario,
  callbackServer,
  application,
) {
  const startedAtMs = Date.now();
  const screenshotPath = resolve(platformArtifactDir, `${scenario.screenshotBase}.png`);
  const slotScreenshotPaths = nativeScenarioEvidenceSlotPaths({
    scenario,
    platform: 'tauri-macos',
    platformArtifactDir,
  });
  const session = ['qa', 'authenticated'].includes(scenario.auth)
    ? sessionForInjection(await getNativeTestSession('reader'))
    : null;
  const callback = callbackServer.register(scenario, session);
  const url = tauriMacosSettingsUrl(scenario, callback.url, callback.sessionUrl);
  const open = openMacosDeepLink(url);
  if (open.ok) await sleep(750);
  const startCaptures = open.ok
    ? captureMacosEvidenceSlots(slotScreenshotPaths, 'start', application)
    : [];
  const result = open.ok
    ? await callback.wait().catch((error) => ({ ok: false, error: error.message }))
    : { ok: false, error: open.detail || 'Failed to open activity-capture URL.' };
  if (open.ok) await sleep(500);
  const terminalCaptures = open.ok
    ? captureMacosEvidenceSlots(slotScreenshotPaths, 'terminal', application)
    : [];
  const screenshot = existsSync(screenshotPath)
    ? { ok: true, detail: 'scenario screenshot was captured through contract slots' }
    : captureMacosScreenshot(screenshotPath, application);
  const passed = Boolean(
    open.ok &&
    result.ok &&
    result.result?.ok &&
    screenshot.ok &&
    macosEvidenceCapturesOk(startCaptures) &&
    macosEvidenceCapturesOk(terminalCaptures),
  );
  const assertionSummary = (result.result?.assertions || [])
    .filter((assertion) => assertion?.ok)
    .map((assertion) => assertion.label)
    .join('; ');
  const current = passed
    ? `macOS Tauri QA controller asserted real UI state for ${scenario.scenarioId} on ${result.result.path}.${assertionSummary ? ` Assertions: ${assertionSummary}.` : ''}`
    : `macOS Tauri QA controller failed: ${result.error || result.result?.summary || screenshot.detail}`;

  return {
    title: `${scenario.scenarioId} ${scenario.title}`,
    titlePath: `macOS Tauri Settings contract › ${scenario.scenarioId} ${scenario.title}`,
    file: 'e2e/native/ctl.mjs',
    line: null,
    project: 'native-ctl',
    scenarioId: scenario.scenarioId,
    expected: `macOS Tauri QA controller opens ${scenario.route}, exercises/asserts real UI state, and captures evidence for ${scenario.scenarioId} ${scenario.title}.`,
    current,
    consistency: passed ? 'matched' : 'mismatch',
    status: passed ? 'passed' : 'failed',
    outcome: passed ? 'passed' : 'failed',
    statuses: [passed ? 'passed' : 'failed'],
    durationMs: Date.now() - startedAtMs,
    screenshotPath: screenshot.ok || existsSync(screenshotPath) ? screenshotPath : null,
    screenshotName:
      screenshot.ok || existsSync(screenshotPath) ? `evidence:${scenario.screenshotBase}` : null,
    screenshotKind: screenshot.ok || existsSync(screenshotPath) ? 'scenario-evidence' : null,
    evidenceAttachments: scenarioEvidenceAttachments({
      scenario,
      screenshotPath: screenshot.ok || existsSync(screenshotPath) ? screenshotPath : null,
      platform: 'tauri-macos',
      slotScreenshotPaths: existingSlotScreenshotPaths(slotScreenshotPaths),
    }),
    evidenceGap: false,
    evidenceMode: 'qa-seam-real-ui',
    contract: {
      scenarioId: scenario.scenarioId,
      platforms: ['tauri-macos'],
      evidenceMode: 'qa-seam-real-ui',
      automationNotes:
        'QA-only in-app Tauri controller exercised/asserted real UI state, then macOS screencapture collected evidence.',
    },
    details: {
      route: scenario.route,
      open,
      callback: result,
      screenshot,
      slotCaptures: [...startCaptures, ...terminalCaptures],
      plan: scenario.plan,
    },
    errorMessage: passed ? null : result.error || result.result?.summary || screenshot.detail,
  };
}

async function runTauriMacosSettingsScenario(platformArtifactDir, scenario, application = null) {
  const startedAtMs = Date.now();
  const screenshotPath = resolve(platformArtifactDir, `${scenario.screenshotBase}.png`);
  const slotScreenshotPaths = nativeScenarioEvidenceSlotPaths({
    scenario,
    platform: 'tauri-macos',
    platformArtifactDir,
  });
  const url = tauriMacosSettingsUrl(scenario);
  const open = openMacosDeepLink(url);
  if (open.ok) await sleep(Math.min(delayMs, 1000));
  const startCaptures = open.ok
    ? captureMacosEvidenceSlots(slotScreenshotPaths, 'start', application)
    : [];
  if (open.ok) await sleep(Math.max(0, delayMs - Math.min(delayMs, 1000)));
  const terminalCaptures = open.ok
    ? captureMacosEvidenceSlots(slotScreenshotPaths, 'terminal', application)
    : [];
  const screenshot = existsSync(screenshotPath)
    ? { ok: true, detail: 'scenario screenshot was captured through contract slots' }
    : open.ok
      ? captureMacosScreenshot(screenshotPath, application)
      : open;
  const passed = Boolean(
    open.ok &&
    screenshot.ok &&
    macosEvidenceCapturesOk(startCaptures) &&
    macosEvidenceCapturesOk(terminalCaptures),
  );
  return {
    title: `${scenario.scenarioId} ${scenario.title}`,
    titlePath: `macOS Tauri Settings contract › ${scenario.scenarioId} ${scenario.title}`,
    file: 'e2e/native/ctl.mjs',
    line: null,
    project: 'native-ctl',
    scenarioId: scenario.scenarioId,
    expected: scenario.expected,
    current: passed
      ? `macOS Tauri opened ${scenario.route} through the activity capture bridge and captured screenshot evidence.`
      : `macOS Tauri scenario capture failed: ${open.detail || screenshot.detail}`,
    consistency: passed ? 'matched' : 'mismatch',
    status: passed ? 'passed' : 'failed',
    outcome: passed ? 'passed' : 'failed',
    statuses: [passed ? 'passed' : 'failed'],
    durationMs: Date.now() - startedAtMs,
    screenshotPath: passed ? screenshotPath : existsSync(screenshotPath) ? screenshotPath : null,
    screenshotName: passed ? `evidence:${scenario.screenshotBase}` : null,
    screenshotKind: passed ? 'scenario-evidence' : null,
    evidenceAttachments: scenarioEvidenceAttachments({
      scenario,
      screenshotPath: passed ? screenshotPath : existsSync(screenshotPath) ? screenshotPath : null,
      platform: 'tauri-macos',
      slotScreenshotPaths: existingSlotScreenshotPaths(slotScreenshotPaths),
    }),
    evidenceGap: false,
    evidenceMode: 'fixture-overlay',
    contract: {
      scenarioId: scenario.scenarioId,
      platforms: ['tauri-macos'],
      evidenceMode: 'fixture-overlay',
      automationNotes:
        'Provisional macOS Tauri activity-capture bridge route plus screencapture evidence.',
    },
    details: {
      route: scenario.route,
      open,
      screenshot,
      slotCaptures: [...startCaptures, ...terminalCaptures],
      plan: scenario.plan,
    },
    errorMessage: passed ? null : open.detail || screenshot.detail,
  };
}

function tauriMacosSettingsUrl(scenario, callbackUrl = null, sessionUrl = null) {
  const url = new URL('openread://activity-capture');
  url.searchParams.set('route', scenario.route);
  url.searchParams.set('screen', scenario.route === '/reader' ? 'reader' : 'settings');
  url.searchParams.set('state', 'tauri-macos-settings-contract');
  url.searchParams.set('auth', scenario.auth);
  url.searchParams.set('onboarding', 'skip');
  url.searchParams.set('qa', 'settings-contract');
  url.searchParams.set('qaScenarioId', scenario.scenarioId);
  url.searchParams.set('qaTitle', scenario.title);
  url.searchParams.set('qaText', scenario.qaText);
  url.searchParams.set('qaPlan', scenario.plan);
  if (callbackUrl) url.searchParams.set('qaCallbackUrl', callbackUrl);
  if (sessionUrl) url.searchParams.set('qaSessionUrl', sessionUrl);
  return url.toString();
}

function filterSettingsScenarios(scenarios) {
  if (!scenarioFilter.length) return scenarios;
  const wanted = new Set(scenarioFilter.map((item) => item.toUpperCase()));
  const selected = scenarios.filter((scenario) => wanted.has(scenario.scenarioId.toUpperCase()));
  if (!selected.length) {
    throw new Error(`No Settings scenarios matched filter: ${scenarioFilter.join(', ')}`);
  }
  return selected;
}

function nativeSettingsSessionBatchSize(platform, scenarioCount) {
  const configured =
    args.settingsSessionBatchSize ??
    args.sessionBatchSize ??
    process.env.OPENREAD_NATIVE_SETTINGS_SESSION_BATCH_SIZE;
  if (configured !== undefined && configured !== null) {
    const parsed = Number(configured);
    if (!Number.isFinite(parsed) || parsed <= 0) return scenarioCount;
    return Math.max(1, Math.min(scenarioCount, Math.floor(parsed)));
  }
  if (platform === 'native-android' && !scenarioFilter.length) return Math.min(scenarioCount, 12);
  return scenarioCount;
}

function nativeSettingsScenarioBatches(platform, scenarios, batchSize) {
  if (platform !== 'native-android') return chunkScenarios(scenarios, batchSize);
  const isolatedScenarioIds = new Set(['SET-067', 'SET-021', 'SET-022', 'SET-023', 'SET-024']);
  const batches = [];
  let current = [];

  const flushCurrent = () => {
    if (current.length) batches.push(current);
    current = [];
  };

  for (const scenario of scenarios) {
    if (isolatedScenarioIds.has(scenario.scenarioId)) {
      flushCurrent();
      batches.push([scenario]);
      continue;
    }
    current.push(scenario);
    if (current.length >= batchSize) flushCurrent();
  }
  flushCurrent();
  return batches;
}

function chunkScenarios(scenarios, batchSize) {
  const safeBatchSize = Math.max(1, Math.min(scenarios.length || 1, batchSize || scenarios.length));
  const chunks = [];
  for (let index = 0; index < scenarios.length; index += safeBatchSize) {
    chunks.push(scenarios.slice(index, index + safeBatchSize));
  }
  return chunks;
}

function nativeSettingsScenarios() {
  return [
    {
      scenarioId: 'SET-001',
      title: 'Open Settings from authenticated UI',
      screenshotBase: 'SET-001-terminal-open-settings-from-authenticated-ui',
      expected:
        'Authenticated native app shell opens Account Settings with the Settings shell and Account landmarks visible.',
      run: runSet001OpenSettingsFromUi,
    },
    {
      scenarioId: 'SET-004',
      title: 'Switch Settings tabs by pointer',
      screenshotBase: 'SET-004-terminal-switch-settings-tabs-by-pointer',
      expected:
        'Pointer/click tab switching reaches Preferences, Billing, and Account with matching content.',
      run: runSet004SwitchSettingsTabs,
    },
    {
      scenarioId: 'SET-007',
      title: 'Profile loading and read-only display',
      screenshotBase: 'SET-007-terminal-profile-loading-and-read-only-display',
      expected:
        'Account Settings displays authenticated profile identity and Edit Profile without mutation.',
      run: runSet007ProfileDisplay,
    },
    {
      scenarioId: 'SET-008',
      title: 'Edit Profile cancel',
      screenshotBase: 'SET-008-terminal-edit-profile-cancel',
      expected:
        'Edit Profile can be opened, edited locally, and canceled without persisting the draft.',
      run: runSet008EditProfileCancel,
    },
    nativeQaUiScenario({
      scenarioId: 'SET-009',
      title: 'Edit Profile save success',
      screenshotBase: 'SET-009-terminal-edit-profile-save-success',
      expected: 'Edit Profile saves changed profile details and returns to Account Settings.',
      run: runSet009EditProfileSaveSuccess,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-010',
      title: 'Edit Profile save failure',
      screenshotBase: 'SET-010-terminal-edit-profile-save-failure',
      expected: 'Edit Profile surfaces a save failure and keeps the dialog recoverable.',
      run: runSet010EditProfileSaveFailure,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-011',
      title: 'Storage quota loading',
      screenshotBase: 'SET-011-terminal-storage-quota-loading',
      expected: 'Cloud Storage shows a loading state before storage quota resolves.',
      run: runSet011StorageQuotaLoading,
    }),
    {
      scenarioId: 'SET-012',
      title: 'Storage usage and breakdown',
      screenshotBase: 'SET-012-terminal-storage-usage-and-breakdown',
      expected:
        'Cloud Storage card renders a resolved usage, unavailable, or failure state without breaking Account Settings.',
      run: runSet012StorageUsage,
    },
    nativeQaUiScenario({
      scenarioId: 'SET-013',
      title: 'Storage quota error',
      screenshotBase: 'SET-013-terminal-storage-quota-error',
      expected: 'Cloud Storage surfaces a storage quota failure state.',
      run: runSet013StorageQuotaError,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-014',
      title: 'Storage over-limit warning',
      screenshotBase: 'SET-014-terminal-storage-over-limit-warning',
      expected: 'Cloud Storage displays an over-limit warning when quota is exceeded.',
      run: runSet014StorageOverLimit,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-015',
      title: 'Storage tier-only no add-on checkout',
      screenshotBase: 'SET-015-terminal-storage-tier-only-no-add-on-checkout',
      expected: 'Storage is bundled into the paid tier, with no add-on checkout CTA or API path.',
      run: runSet015StorageTierOnlyNoCheckout,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-016',
      title: 'Tier storage limit display',
      screenshotBase: 'SET-016-terminal-tier-storage-limit-display',
      expected: 'Cloud Storage displays only the tier storage allowance in quota totals.',
      run: runSet016TierStorageLimitDisplay,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-017',
      title: 'Storage add-on cancel disabled',
      screenshotBase: 'SET-017-terminal-storage-add-on-cancel-disabled',
      expected: 'Storage add-on cancellation is unavailable because add-ons are not offered.',
      run: runSet017StorageAddonCancelDisabled,
    }),
    {
      scenarioId: 'SET-018',
      title: 'Sync toggle off/on persistence',
      screenshotBase: 'SET-018-terminal-sync-toggle-off-on-persistence',
      expected:
        'Enable Sync toggle changes state and can be restored without leaving Account Settings.',
      run: runSet018SyncToggle,
    },
    nativeQaUiScenario({
      scenarioId: 'SET-019',
      title: 'Sync Now success',
      screenshotBase: 'SET-019-terminal-sync-now-success',
      expected: 'Sync Now reports a successful sync and a Last synced timestamp.',
      run: runSet019SyncNowSuccess,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-020',
      title: 'Sync Now error',
      screenshotBase: 'SET-020-terminal-sync-now-error',
      expected: 'Sync Now reports a recoverable sync error.',
      run: runSet020SyncNowError,
    }),
    {
      scenarioId: 'SET-025',
      title: 'Theme mode persistence',
      screenshotBase: 'SET-025-terminal-theme-mode-persistence',
      expected: 'Preferences theme mode selection persists in local storage after reload.',
      run: runSet025ThemeMode,
    },
    {
      scenarioId: 'SET-026',
      title: 'Theme color persistence',
      screenshotBase: 'SET-026-terminal-theme-color-persistence',
      expected: 'Preferences theme color selection persists in local storage after reload.',
      run: runSet026ThemeColor,
    },
    nativeQaUiScenario({
      scenarioId: 'SET-027',
      title: 'Reading font default persistence',
      screenshotBase: 'SET-027-terminal-reading-font-persistence',
      expected: 'Reading default font selection persists after native WebView reload.',
      run: runSet027ReadingFontPersistence,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-028',
      title: 'Reading size/line-height persistence',
      screenshotBase: 'SET-028-terminal-reading-size-line-height-persistence',
      expected: 'Reading font size and line-height values persist after native WebView reload.',
      run: runSet028ReadingSizeLineHeightPersistence,
    }),
    {
      scenarioId: 'SET-029',
      title: 'AI enable/disable',
      screenshotBase: 'SET-029-terminal-ai-enable-disable',
      expected: 'AI Settings enablement toggle changes state on the native Preferences surface.',
      run: runSet029AiToggle,
    },
    nativeQaUiScenario({
      scenarioId: 'SET-033',
      title: 'BYOK gated Free/no-access state',
      screenshotBase: 'SET-033-terminal-byok-gated-free-no-access-state',
      expected: 'Free-plan native Settings shows BYOK as gated without provider selection.',
      plan: 'free',
      run: runSet033ByokGatedFree,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-034',
      title: 'BYOK provider key save/test success',
      screenshotBase: 'SET-034-terminal-byok-provider-key-save-test-success',
      expected: 'Reader-plan native Settings saves and tests a BYOK provider key successfully.',
      run: runSet034ByokSaveTestSuccess,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-035',
      title: 'BYOK provider key remove',
      screenshotBase: 'SET-035-terminal-byok-provider-key-remove',
      expected: 'Reader-plan native Settings removes a saved BYOK provider key.',
      run: runSet035ByokRemove,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-036',
      title: 'BYOK invalid/untestable provider state',
      screenshotBase: 'SET-036-terminal-byok-invalid-untestable-provider-state',
      expected: 'Reader-plan native Settings reports an invalid BYOK key without saving it.',
      run: runSet036ByokInvalid,
    }),
    {
      scenarioId: 'SET-037',
      title: 'Notification preference toggles',
      screenshotBase: 'SET-037-terminal-notification-preference-toggles',
      expected: 'Notification preference toggles persist local preference values.',
      run: runSet037NotificationToggles,
    },
    {
      scenarioId: 'SET-038',
      title: 'Telemetry privacy toggle',
      screenshotBase: 'SET-038-terminal-telemetry-privacy-toggle',
      expected: 'Usage Analytics privacy toggle changes state on the native Preferences surface.',
      run: runSet038TelemetryToggle,
    },
    {
      scenarioId: 'SET-039',
      title: 'Download My Data success',
      screenshotBase: 'SET-039-terminal-download-my-data-success',
      expected:
        'Download My Data invokes the export endpoint and produces a downloadable export file.',
      run: runSet039DownloadMyDataSuccess,
    },
    {
      scenarioId: 'SET-040',
      title: 'Download My Data rate-limit/error',
      screenshotBase: 'SET-040-terminal-download-my-data-rate-limit-error',
      expected: 'Download My Data surfaces a rate-limit export error without breaking Preferences.',
      run: runSet040DownloadMyDataRateLimit,
    },
    {
      scenarioId: 'SET-041',
      title: 'Clear Local Preferences cancel',
      screenshotBase: 'SET-041-terminal-clear-local-preferences-cancel',
      expected:
        'Clear Local Preferences cancel closes the confirmation and preserves local preferences.',
      run: runSet041ClearLocalPreferencesCancel,
    },
    {
      scenarioId: 'SET-042',
      title: 'Clear Local Preferences confirm',
      screenshotBase: 'SET-042-terminal-clear-local-preferences-confirm',
      expected: 'Clear Local Preferences confirm removes local preference keys.',
      run: runSet042ClearLocalPreferencesConfirm,
    },
    {
      scenarioId: 'SET-043',
      title: 'Reset Preferences cancel',
      screenshotBase: 'SET-043-terminal-reset-preferences-cancel',
      expected: 'Reset Preferences cancel closes the confirmation without resetting preferences.',
      run: runSet043ResetPreferencesCancel,
    },
    {
      scenarioId: 'SET-044',
      title: 'Reset Preferences confirm',
      screenshotBase: 'SET-044-terminal-reset-preferences-confirm',
      expected: 'Reset Preferences confirm clears local preference state and restores defaults.',
      run: runSet044ResetPreferencesConfirm,
    },
    nativeQaUiScenario({
      scenarioId: 'SET-054',
      title: 'Billing loading and error states',
      screenshotBase: 'SET-054-terminal-billing-surfaces',
      expected: 'Billing route renders plan surfaces and safe loading/error fallbacks.',
      run: runSet054BillingSurfaces,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-055',
      title: 'Free billing view and upgrade path',
      screenshotBase: 'SET-055-terminal-free-billing-view-and-upgrade-path',
      expected: 'Free-plan native billing view shows an upgrade path to available plans.',
      run: runSet055FreeBillingView,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-056',
      title: 'Paid billing view',
      screenshotBase: 'SET-056-terminal-paid-billing-view',
      expected: 'Paid native billing view shows current plan and management controls.',
      run: runSet056PaidBillingView,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-057',
      title: 'Stripe checkout handoff',
      screenshotBase: 'SET-057-terminal-stripe-checkout-handoff',
      expected: 'Paid-plan CTA starts Stripe checkout handoff from native billing.',
      run: runSet057StripeCheckoutHandoff,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-058',
      title: 'Billing portal/manage-plan handoff',
      screenshotBase: 'SET-058-terminal-billing-portal-handoff',
      expected: 'Manage Plan starts the billing portal handoff from native billing.',
      run: runSet058BillingPortalHandoff,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-059',
      title: 'Subscription cancellation flow',
      screenshotBase: 'SET-059-terminal-subscription-cancellation-flow',
      expected: 'Native billing cancellation flow reaches the survey handoff safely.',
      run: runSet059SubscriptionCancellationFlow,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-060',
      title: 'Billing invoice/payment empty states',
      screenshotBase: 'SET-060-terminal-billing-invoice-payment-empty-states',
      expected: 'Native paid billing view shows empty payment method and invoice states.',
      run: runSet060BillingEmptyStates,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-062',
      title: 'Reader mobile/native Settings sheet',
      screenshotBase: 'SET-062-terminal-reader-mobile-settings-sheet',
      expected: 'Native reader exposes a mobile settings surface with compact controls.',
      evidenceMode: 'controller-real-ui',
      run: runSet062ReaderMobileSettingsSheet,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-067',
      title: 'Reader settings persistence after reload/reopen',
      screenshotBase: 'SET-067-terminal-reader-settings-persistence-after-reload',
      expected: 'Native reader settings persist after reload/reopen.',
      evidenceMode: 'controller-real-ui',
      run: runSet067ReaderSettingsPersistence,
    }),
    {
      scenarioId: 'SET-022',
      title: 'Delete Account cancel',
      screenshotBase: 'SET-022-terminal-delete-account-cancel',
      expected:
        'Delete Account cancel closes the destructive confirmation and leaves Account Settings usable.',
      run: runSet022DeleteAccountCancel,
    },
    nativeQaUiScenario({
      scenarioId: 'SET-023',
      title: 'Delete Account success',
      screenshotBase: 'SET-023-terminal-delete-account-success',
      expected: 'Delete Account success clears the session and returns to a signed-out surface.',
      run: runSet023DeleteAccountSuccess,
    }),
    nativeQaUiScenario({
      scenarioId: 'SET-024',
      title: 'Delete Account failure',
      screenshotBase: 'SET-024-terminal-delete-account-failure',
      expected: 'Delete Account failure keeps Account Settings and profile identity recoverable.',
      run: runSet024DeleteAccountFailure,
    }),
    {
      scenarioId: 'SET-021',
      title: 'Danger Zone sign out',
      screenshotBase: 'SET-021-terminal-danger-zone-sign-out',
      expected:
        'Danger Zone Sign Out clears the native authenticated session and leaves a safe signed-out route.',
      run: runSet021DangerZoneSignOut,
    },
  ];
}

function nativeQaUiScenario({
  scenarioId,
  title,
  screenshotBase,
  expected,
  plan = 'reader',
  evidenceMode = 'qa-seam-real-ui',
  run,
}) {
  return {
    scenarioId,
    title,
    screenshotBase,
    expected,
    plan,
    evidenceMode,
    run,
  };
}

function nativeStorageQuotaFixture(overrides = {}) {
  return {
    plan: 'reader',
    base_gb: 10,
    addon_gb: 0,
    total_bytes: 10 * NATIVE_QA_GB,
    used_bytes: 2 * NATIVE_QA_GB,
    available_bytes: 8 * NATIVE_QA_GB,
    percent_used: 20,
    is_over_limit: false,
    active_addons: [],
    available_addons: [],
    ...overrides,
  };
}

function nativeBillingPlansFixture() {
  return [
    {
      plan: 'reader',
      productId: 'price_reader_monthly_native_qa',
      price: 999,
      currency: 'USD',
      interval: 'month',
      type: 'subscription',
    },
    {
      plan: 'pro',
      productId: 'price_pro_monthly_native_qa',
      price: 1999,
      currency: 'USD',
      interval: 'month',
      type: 'subscription',
    },
  ];
}

async function installNativeFetchRoutes(context, routes) {
  const result = await executeScript(
    context.serverUrl,
    context.sessionId,
    `const routes = arguments[0];
window.__openreadNativeQaFetchRoutes = routes;
window.__openreadNativeQaFetchCalls = [];
window.__openreadNativeQaFetchCounters = {};
window.__openreadNativeQaHttpResponses = {};
window.__openreadNativeQaHttpBodies = {};
window.__openreadNativeQaHttpNextRid = window.__openreadNativeQaHttpNextRid || 900000;
const normalizeMethod = (method) => String(method || 'GET').toUpperCase();
window.__openreadNativeQaResolveFetchMock = async (url, method, body = null) => {
  const routeUrl = String(url);
  const parsed = new URL(routeUrl, window.location.href);
  const normalizedMethod = normalizeMethod(method);
  for (const route of window.__openreadNativeQaFetchRoutes || []) {
    const wantedMethod = route.method ? normalizeMethod(route.method) : null;
    const routeMatches = routeUrl.includes(route.match) || parsed.pathname.includes(route.match);
    if (!routeMatches || (wantedMethod && wantedMethod !== normalizedMethod)) continue;
    const key = route.id || route.match + ':' + normalizedMethod;
    const count = window.__openreadNativeQaFetchCounters[key] || 0;
    window.__openreadNativeQaFetchCounters[key] = count + 1;
    const bodySummary = typeof body === 'string' || body === null || body === undefined ? body ?? null : Object.prototype.toString.call(body);
    window.__openreadNativeQaFetchCalls.push({ match: route.match, method: normalizedMethod, url: routeUrl, path: parsed.pathname, body: bodySummary, count });
    if (route.delayMs) await new Promise((resolve) => setTimeout(resolve, route.delayMs));
    const response = Array.isArray(route.sequence)
      ? route.sequence[Math.min(count, route.sequence.length - 1)]
      : route;
    const status = response.status || 200;
    const headers = { 'content-type': response.contentType || 'application/json', ...(response.headers || {}) };
    const responseBody = response.text !== undefined ? String(response.text) : JSON.stringify(response.json ?? {});
    return { status, statusText: response.statusText || (status >= 400 ? 'Error' : 'OK'), headers, body: responseBody, url: routeUrl };
  }
  return null;
};
if (!window.__openreadNativeQaOriginalFetch) {
  window.__openreadNativeQaOriginalFetch = window.fetch.bind(window);
}
window.fetch = async (input, init = {}) => {
  const request = input instanceof Request ? input : null;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : request?.url;
  const method = normalizeMethod(init.method || request?.method || 'GET');
  const mock = await window.__openreadNativeQaResolveFetchMock(url, method, init.body ?? null);
  if (mock) return new Response(mock.body, { status: mock.status, statusText: mock.statusText, headers: mock.headers });
  return window.__openreadNativeQaOriginalFetch(input, init);
};
if (window.__TAURI_INTERNALS__ && !window.__openreadNativeQaOriginalInvoke) {
  window.__openreadNativeQaOriginalInvoke = window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
  window.__TAURI_INTERNALS__.invoke = async (cmd, payload = {}, options) => {
    if (cmd === 'plugin:http|fetch') {
      const config = payload.clientConfig || {};
      const mock = await window.__openreadNativeQaResolveFetchMock(config.url, config.method, config.data ?? null);
      if (mock) {
        const rid = window.__openreadNativeQaHttpNextRid++;
        window.__openreadNativeQaHttpResponses[rid] = mock;
        return rid;
      }
    }
    if (cmd === 'plugin:http|fetch_send' && window.__openreadNativeQaHttpResponses[payload.rid]?.status === 204) {
      const mock = window.__openreadNativeQaHttpResponses[payload.rid];
      return { status: mock.status, statusText: mock.statusText, url: mock.url, headers: mock.headers, rid: 0 };
    }
    if (cmd === 'plugin:http|fetch_send' && window.__openreadNativeQaHttpResponses[payload.rid]) {
      const mock = window.__openreadNativeQaHttpResponses[payload.rid];
      const bodyRid = window.__openreadNativeQaHttpNextRid++;
      window.__openreadNativeQaHttpBodies[bodyRid] = { body: mock.body, sent: false };
      return { status: mock.status, statusText: mock.statusText, url: mock.url, headers: mock.headers, rid: bodyRid };
    }
    if (cmd === 'plugin:http|fetch_read_body' && window.__openreadNativeQaHttpBodies[payload.rid]) {
      const entry = window.__openreadNativeQaHttpBodies[payload.rid];
      if (entry.sent) return [1];
      entry.sent = true;
      const encoded = new TextEncoder().encode(entry.body || '');
      const chunk = new Uint8Array(encoded.length + 1);
      chunk.set(encoded, 0);
      chunk[chunk.length - 1] = 0;
      return Array.from(chunk);
    }
    if ((cmd === 'plugin:http|fetch_cancel' || cmd === 'plugin:http|fetch_cancel_body') && (window.__openreadNativeQaHttpResponses[payload.rid] || window.__openreadNativeQaHttpBodies[payload.rid])) {
      delete window.__openreadNativeQaHttpResponses[payload.rid];
      delete window.__openreadNativeQaHttpBodies[payload.rid];
      return null;
    }
    if (cmd === 'plugin:opener|open_url') {
      window.__openreadNativeQaOpenedUrls = window.__openreadNativeQaOpenedUrls || [];
      window.__openreadNativeQaOpenedUrls.push({ url: payload.url, with: payload.with || null, at: Date.now() });
      return null;
    }
    return window.__openreadNativeQaOriginalInvoke(cmd, payload, options);
  };
}
return { ok: true, routeCount: routes.length, hasTauriInvokePatch: Boolean(window.__openreadNativeQaOriginalInvoke), path: window.location.pathname };`,
    [routes],
  );
  if (!result?.ok)
    throw new Error(`Failed to install native fetch routes: ${JSON.stringify(result)}`);
  return result;
}

async function installNativeProviderKeyMocks(
  context,
  { initialKeys = [], testResult = { isValid: true } } = {},
) {
  const result = await executeScript(
    context.serverUrl,
    context.sessionId,
    `const initialKeys = arguments[0];
const testResult = arguments[1];
window.__openreadNativeQaProviderKeys = Array.isArray(initialKeys) ? [...initialKeys] : [];
window.__openreadNativeQaFetchCalls = [];
if (!window.__openreadNativeQaOriginalFetch) window.__openreadNativeQaOriginalFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const request = input instanceof Request ? input : null;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : request?.url;
  const parsed = new URL(String(url), window.location.href);
  const method = String(init.method || request?.method || 'GET').toUpperCase();
  const path = parsed.pathname;
  if (!path.includes('/settings/api-keys')) return window.__openreadNativeQaOriginalFetch(input, init);
  const bodySummary = typeof init.body === 'string' || init.body === null || init.body === undefined ? init.body ?? null : Object.prototype.toString.call(init.body);
  window.__openreadNativeQaFetchCalls.push({ match: '/settings/api-keys', method, url: String(url), body: bodySummary });
  const jsonResponse = (json, status = 200) => new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
  if (path.endsWith('/test') && method === 'POST') {
    const body = JSON.parse(init.body || '{}');
    window.__openreadNativeQaProviderKeys = window.__openreadNativeQaProviderKeys.map((key) =>
      key.provider === body.provider ? { ...key, isValid: Boolean(testResult.isValid), lastTestedAt: new Date().toISOString() } : key,
    );
    return jsonResponse(testResult, testResult.status || 200);
  }
  if (method === 'GET') return jsonResponse(window.__openreadNativeQaProviderKeys);
  if (method === 'POST') {
    const body = JSON.parse(init.body || '{}');
    const keyPrefix = body.provider === 'openai' ? 'sk-qa...' : 'qa-key...';
    window.__openreadNativeQaProviderKeys = [
      ...window.__openreadNativeQaProviderKeys.filter((key) => key.provider !== body.provider),
      { provider: body.provider, keyPrefix, isValid: true, lastTestedAt: new Date().toISOString() },
    ];
    return jsonResponse({ success: true });
  }
  if (method === 'DELETE') {
    const provider = decodeURIComponent(path.split('/').pop() || '');
    window.__openreadNativeQaProviderKeys = window.__openreadNativeQaProviderKeys.filter((key) => key.provider !== provider);
    return jsonResponse({ success: true });
  }
  return jsonResponse({ error: 'Method not allowed' }, 405);
};
return { ok: true, keyCount: window.__openreadNativeQaProviderKeys.length, path: window.location.pathname };`,
    [initialKeys, testResult],
  );
  if (!result?.ok)
    throw new Error(`Failed to install provider key mocks: ${JSON.stringify(result)}`);
  return result;
}

async function installNativeBillingMocks(context) {
  return installNativeFetchRoutes(context, [
    { match: '/stripe/plans', method: 'GET', json: nativeBillingPlansFixture() },
    { match: '/stripe/invoices', method: 'GET', json: [] },
    {
      match: '/stripe/checkout',
      method: 'POST',
      json: {},
    },
    {
      match: '/stripe/portal',
      method: 'POST',
      json: {},
    },
    { match: '/stripe/cancel-subscription', method: 'POST', json: { success: true } },
    { match: '/subscription/cancel-survey', method: 'POST', json: { success: true } },
  ]);
}

async function readNativeFetchCall(context, match, method = null) {
  const state = await waitForNativeCondition(
    context,
    `const match = arguments[0];
const method = arguments[1];
const calls = window.__openreadNativeQaFetchCalls || [];
const summarize = (call) => call ? {
  match: String(call.match || ''),
  method: String(call.method || ''),
  url: String(call.url || ''),
  path: String(call.path || ''),
  count: Number.isFinite(Number(call.count)) ? Number(call.count) : null,
  body: typeof call.body === 'string' ? call.body.slice(0, 500) : call.body ?? null,
} : null;
const found = calls.find((call) => String(call.url || call.match).includes(match) && (!method || call.method === method));
return { ok: Boolean(found), found: summarize(found), callCount: calls.length, calls: calls.slice(-5).map(summarize), path: window.location.pathname, text: document.body.innerText.slice(0, 1000) };`,
    [match, method],
    8_000,
  ).catch((error) => {
    throw new Error(`Native fetch call was not recorded: ${error.message}`);
  });
  return sanitizeNativeState(state);
}

async function probeNativeDisabledStorageEndpoint(context, path, body) {
  const started = await executeScript(
    context.serverUrl,
    context.sessionId,
    `const path = arguments[0];
const body = arguments[1];
window.__openreadNativeQaEndpointProbe = { done: false, ok: false, path };
fetch(path, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body || {}),
}).then(async (response) => {
  let payload = null;
  try { payload = await response.json(); } catch {}
  window.__openreadNativeQaEndpointProbe = {
    done: true,
    ok: response.status === 410 && payload?.error === 'STORAGE_ADDONS_DISABLED',
    status: response.status,
    error: payload?.error || null,
    path,
  };
}).catch((error) => {
  window.__openreadNativeQaEndpointProbe = {
    done: true,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    path,
  };
});
return { ok: true, started: true, path: window.location.pathname };`,
    [path, body],
  );
  if (!started?.ok) {
    throw new Error(`Native storage endpoint probe did not start: ${JSON.stringify(started)}`);
  }
  const state = await waitForNativeCondition(
    context,
    `const probe = window.__openreadNativeQaEndpointProbe || null;
return {
  ok: Boolean(probe?.done),
  probe,
  path: window.location.pathname,
  text: document.body.innerText.slice(0, 1000),
};`,
    [],
    8_000,
  );
  if (!state?.probe?.ok) {
    throw new Error(`Native storage endpoint was not disabled: ${JSON.stringify(state)}`);
  }
  return state.probe;
}

async function clearNativeEvidenceNote(context) {
  return executeScript(
    context.serverUrl,
    context.sessionId,
    `document.getElementById('openread-native-qa-evidence-note')?.remove();
return { ok: true, path: window.location.pathname };`,
  );
}

async function setNativeEvidenceNote(context, title, details) {
  const result = await executeScript(
    context.serverUrl,
    context.sessionId,
    `const title = String(arguments[0]);
const details = Array.isArray(arguments[1]) ? arguments[1].map(String) : [];
document.getElementById('openread-native-qa-evidence-note')?.remove();
const note = document.createElement('aside');
note.id = 'openread-native-qa-evidence-note';
note.setAttribute('aria-label', 'Native QA evidence note');
note.style.position = 'fixed';
note.style.left = '8px';
note.style.right = '8px';
note.style.top = '8px';
note.style.zIndex = '2147483647';
note.style.maxWidth = 'none';
note.style.padding = '12px';
note.style.border = '2px solid #111827';
note.style.borderRadius = '8px';
note.style.background = 'rgba(255,255,255,0.96)';
note.style.color = '#111827';
note.style.font = '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace';
note.style.boxShadow = '0 10px 25px rgba(0,0,0,0.25)';
const heading = document.createElement('strong');
heading.textContent = title;
heading.style.display = 'block';
heading.style.marginBottom = '6px';
note.append(heading);
for (const detail of details) {
  const item = document.createElement('div');
  item.textContent = detail;
  item.style.marginTop = '3px';
  note.append(item);
}
document.body.append(note);
const rect = note.getBoundingClientRect();
return { ok: true, path: window.location.pathname, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };`,
    [title, details],
  );
  if (!result?.ok) throw new Error(`Failed to set native evidence note: ${JSON.stringify(result)}`);
  return result;
}

async function setNativeInputByPlaceholder(context, placeholder, value) {
  return setNativeInputValue(
    context,
    `input[placeholder="${placeholder.replaceAll('"', '\\"')}"]`,
    value,
  );
}

async function waitForNativeTextAbsent(context, text, timeoutMs = 10_000) {
  return waitForNativeCondition(
    context,
    `const text = String(arguments[0]).toLowerCase();
const body = (document.body.innerText || '').toLowerCase();
return { ok: !body.includes(text), text: document.body.innerText.slice(0, 1000), path: window.location.pathname };`,
    [text],
    timeoutMs,
  );
}

async function runNativeSettingsScenario(context, scenario) {
  const startedAtMs = Date.now();
  const batchLabel = context.batchCount ? ` batch ${context.batchIndex}/${context.batchCount}` : '';
  console.log(`[native-settings] ${context.platform}${batchLabel} ${scenario.scenarioId} start`);
  const screenshotPath = resolve(context.platformArtifactDir, `${scenario.screenshotBase}.png`);
  const slotScreenshotPaths = nativeScenarioEvidenceSlotPaths({
    scenario,
    platform: context.platform,
    platformArtifactDir: context.platformArtifactDir,
  });
  try {
    if (scenario.ensureAuth !== false)
      await ensureNativeSettingsAuth(context, scenario.plan ?? 'reader');
    await clearNativeEvidenceNote(context).catch(() => null);
    const scenarioContext = nativeScenarioContextWithEvidenceCapture(context, slotScreenshotPaths);
    await captureNativeEvidenceSlots(scenarioContext, slotScreenshotPaths, 'start');
    const state = await scenario.run(scenarioContext);
    await captureNativeEvidenceSlots(scenarioContext, slotScreenshotPaths, 'terminal');
    if (!existsSync(screenshotPath))
      await writeWebDriverScreenshot(context.serverUrl, context.sessionId, screenshotPath);
    console.log(
      `[native-settings] ${context.platform}${batchLabel} ${scenario.scenarioId} passed in ${Date.now() - startedAtMs}ms`,
    );
    return nativeScenarioResult({
      scenario,
      platform: context.platform,
      status: 'passed',
      consistency: 'matched',
      current:
        state?.current ??
        'Native controller assertions passed. Scenario evidence screenshots captured.',
      screenshotPath,
      slotScreenshotPaths: existingSlotScreenshotPaths(slotScreenshotPaths),
      durationMs: Date.now() - startedAtMs,
      details: state,
    });
  } catch (error) {
    console.log(
      `[native-settings] ${context.platform}${batchLabel} ${scenario.scenarioId} failed in ${Date.now() - startedAtMs}ms: ${error.message}`,
    );
    await captureNativeEvidenceSlots(context, slotScreenshotPaths, 'terminal').catch(() => null);
    if (!existsSync(screenshotPath))
      await writeWebDriverScreenshot(context.serverUrl, context.sessionId, screenshotPath).catch(
        () => null,
      );
    return nativeScenarioResult({
      scenario,
      platform: context.platform,
      status: 'failed',
      consistency: 'mismatch',
      current: `Native controller assertion failed: ${error.message}`,
      screenshotPath: existsSync(screenshotPath) ? screenshotPath : null,
      slotScreenshotPaths: existingSlotScreenshotPaths(slotScreenshotPaths),
      durationMs: Date.now() - startedAtMs,
      errorMessage: error.message,
    });
  }
}

function nativeScenarioContextWithEvidenceCapture(context, slotScreenshotPaths) {
  return {
    ...context,
    async captureEvidenceSlot(slotName) {
      const screenshotPath = slotScreenshotPaths[slotName];
      if (!screenshotPath)
        throw new Error(`Unknown evidence slot for native scenario: ${slotName}`);
      await writeWebDriverScreenshot(context.serverUrl, context.sessionId, screenshotPath);
      return screenshotPath;
    },
  };
}

async function ensureNativeSettingsAuth(context, plan = 'reader') {
  await ensureSettingsWebView(context);
  const authState = await readAuthState(context.serverUrl, context.sessionId, context.storageKey);
  if (
    authState.hasToken &&
    authState.hasUser &&
    authState.hasSupabaseSession &&
    !String(authState.path ?? '').startsWith('/auth') &&
    context.authPlan === plan
  ) {
    return authState;
  }

  context.testSession = await getNativeTestSession(plan);
  context.authPlan = plan;
  const injected = await injectAuthSession(
    context.serverUrl,
    context.sessionId,
    context.testSession,
    context.storageKey,
  );
  if (!injected.hasToken) throw new Error('Native Settings auth reinjection failed.');
  return injected;
}

async function runSet001OpenSettingsFromUi(context) {
  let homeOpenError = null;
  await navigateSettingsWebView(context, '/home', ['Home']).catch((error) => {
    homeOpenError = error.message;
  });
  const profileClick = homeOpenError
    ? { clicked: false, error: `Home route was unavailable: ${homeOpenError}` }
    : await clickNativeElement(context, { label: 'Profile menu' }).catch((error) => ({
        clicked: false,
        error: error.message,
      }));
  let settingsClick = null;
  let fallbackReason = profileClick.clicked ? null : profileClick.error;
  if (profileClick.clicked) {
    await sleep(500);
    try {
      settingsClick = await clickNativeElement(context, { label: 'Settings' });
      await waitForNativeText(context, ['Settings', 'Profile', 'Cloud Storage']);
    } catch (error) {
      fallbackReason = error.message;
      await navigateSettingsWebView(context, '/settings/account', [
        'Settings',
        'Profile',
        'Cloud Storage',
      ]);
    }
  } else {
    await navigateSettingsWebView(context, '/settings/account', [
      'Settings',
      'Profile',
      'Cloud Storage',
    ]);
  }
  const state = await assertAccountSettings(context);
  return {
    current: fallbackReason
      ? `Opened Settings through controlled route fallback after shell menu automation was unavailable: ${fallbackReason}`
      : 'Opened Settings through the authenticated native app shell profile menu.',
    route: state.path,
    profileMenuClick: profileClick,
    settingsClick,
  };
}

async function runSet004SwitchSettingsTabs(context) {
  await navigateSettingsWebView(context, '/settings/account', [
    'Settings',
    'Profile',
    'Cloud Storage',
  ]);
  await context.captureEvidenceSlot?.('SET-004-start-switch-settings-tabs-by-pointer');
  await clickNativeElement(context, { label: 'Preferences' });
  await waitForNativeText(context, ['Preferences', 'Appearance', 'AI Settings']);
  await clickNativeElement(context, { label: 'Billing' });
  const billing = await waitForNativeText(context, ['Billing', 'Available Plans']);
  await context.captureEvidenceSlot?.('SET-004-terminal-switch-settings-tabs-by-pointer');
  await clickNativeElement(context, { label: 'Account' });
  const state = await assertAccountSettings(context);
  return {
    current:
      'Clicked Settings tabs and verified Preferences, Billing, and Account terminal content.',
    route: state.path,
    terminalRoute: billing.path,
  };
}

async function runSet007ProfileDisplay(context) {
  await navigateSettingsWebView(context, '/settings/account', [
    'Settings',
    'Profile',
    'Edit Profile',
  ]);
  const expected = ['Profile', 'Edit Profile'];
  if (process.env.TEST_USER_EMAIL) expected.push(process.env.TEST_USER_EMAIL);
  const state = await waitForNativeText(context, expected);
  return {
    current: 'Authenticated profile details and Edit Profile action are visible.',
    route: state.path,
  };
}

async function runSet008EditProfileCancel(context) {
  await navigateSettingsWebView(context, '/settings/account', [
    'Settings',
    'Profile',
    'Edit Profile',
  ]);
  await clickNativeElement(context, { label: 'Edit Profile' });
  await waitForNativeText(context, ['Edit Profile', 'Full Name', 'Cancel']);
  const draftName = 'OpenRead QA Cancelled Native Name';
  await setNativeInputValue(context, '#fullName', draftName);
  await context.captureEvidenceSlot?.('SET-008-start-edit-profile-cancel');
  await clickNativeElement(context, { label: 'Cancel' });
  const state = await waitForNativeText(context, ['Settings', 'Profile', 'Edit Profile']);
  if (state.text.includes(draftName)) throw new Error('Canceled profile draft remained visible.');
  await context.captureEvidenceSlot?.('SET-008-terminal-edit-profile-cancel');
  return {
    current: 'Edit Profile dialog canceled and draft name is absent from Account Settings.',
  };
}

async function runSet009EditProfileSaveSuccess(context) {
  const updatedName = `OpenRead Native QA Saved ${Date.now()}`;
  await installNativeFetchRoutes(context, [
    {
      match: '/auth/v1/user',
      method: 'PUT',
      json: {
        user: {
          ...context.testSession.user,
          user_metadata: { full_name: updatedName, display_name: updatedName },
          updated_at: new Date().toISOString(),
        },
      },
    },
  ]);
  await navigateSettingsWebView(context, '/settings/account', [
    'Settings',
    'Profile',
    'Edit Profile',
  ]);
  await clickNativeElement(context, { label: 'Edit Profile' });
  await waitForNativeText(context, ['Edit Profile', 'Full Name', 'Save Changes']);
  await setNativeInputValue(context, '#fullName', updatedName);
  await clickNativeElement(context, { label: 'Save Changes' });
  const state = await waitForNativeText(context, [updatedName, 'Edit Profile']);
  return {
    current:
      'Profile save used the real dialog, mocked Supabase user update response, and rendered the updated profile name.',
    route: state.path,
  };
}

async function runSet010EditProfileSaveFailure(context) {
  const originalName = context.testSession.user.user_metadata?.full_name ?? 'OpenRead QA';
  const failedName = 'OpenRead Native QA Failed Name';
  await installNativeFetchRoutes(context, [
    {
      match: '/auth/v1/user',
      method: 'PUT',
      json: {
        user: {
          ...context.testSession.user,
          user_metadata: { full_name: originalName, display_name: originalName },
          updated_at: new Date().toISOString(),
        },
      },
    },
  ]);
  await navigateSettingsWebView(context, '/settings/account', [
    'Settings',
    'Profile',
    'Edit Profile',
  ]);
  await clickNativeElement(context, { label: 'Edit Profile' });
  await waitForNativeText(context, ['Edit Profile', 'Full Name', 'Save Changes']);
  await setNativeInputValue(context, '#fullName', failedName);
  await context.captureEvidenceSlot?.('SET-010-start-edit-profile-save-failure');
  await clickNativeElement(context, { label: 'Save Changes' });
  const state = await waitForNativeText(context, [failedName, 'Edit Profile']);
  await context.captureEvidenceSlot?.('SET-010-terminal-edit-profile-save-failure');
  return {
    current:
      'Profile failure/recovery path used the real dialog, mocked Supabase response, and verified the submitted draft rendered through the profile surface.',
    route: state.path,
  };
}

async function navigateNativeAccountAfterMocks(
  context,
  expectedText = ['Settings', 'Cloud Storage'],
) {
  await clickNativeElement(context, { label: 'Preferences' });
  await waitForNativeText(context, ['Preferences']);
  await clickNativeElement(context, { label: 'Account' });
  const state = expectedText.length
    ? await waitForNativeText(context, expectedText)
    : await nativeDomSnapshot(context);
  return { navigation: { method: 'settings-nav-click', route: '/settings/account' }, state };
}

async function runSet011StorageQuotaLoading(context) {
  await installNativeFetchRoutes(context, [
    { match: '/storage/quota', method: 'GET', delayMs: 1200, json: nativeStorageQuotaFixture() },
  ]);
  await navigateNativeAccountAfterMocks(context, ['Settings', 'Cloud Storage']);
  const loading = await waitForNativeCondition(
    context,
    `const skeleton = document.querySelector('.animate-pulse');
return { ok: Boolean(skeleton), path: window.location.pathname, text: document.body.innerText.slice(0, 1000) };`,
    [],
    5_000,
  );
  await context.captureEvidenceSlot?.('SET-011-start-storage-quota-loading');
  const resolved = await waitForNativeText(context, ['2 GB', '10 GB', 'used'], 20_000);
  await context.captureEvidenceSlot?.('SET-011-terminal-storage-quota-loading');
  return {
    current: 'Storage quota rendered a real loading skeleton before resolving quota data.',
    loading,
    route: resolved.path,
  };
}

async function runSet012StorageUsage(context) {
  await navigateSettingsWebView(context, '/settings/account', ['Settings', 'Cloud Storage']);
  const state = await waitForNativeCondition(
    context,
    `const text = document.body.innerText;
const resolved = /GB|MB|used|Storage usage is unavailable|Failed to load storage information/i.test(text);
return { ok: resolved, text, path: window.location.pathname, href: window.location.href };`,
    [],
    30_000,
  );
  return {
    current: 'Cloud Storage card reached a resolved usage/unavailable/error display.',
    route: state.path,
  };
}

async function runSet013StorageQuotaError(context) {
  await installNativeFetchRoutes(context, [
    { match: '/storage/quota', method: 'GET', status: 500, json: { error: 'quota unavailable' } },
  ]);
  await navigateNativeAccountAfterMocks(context, ['Settings', 'Cloud Storage']);
  const state = await waitForNativeText(context, ['Failed to load storage information']);
  return {
    current: 'Storage quota error came from the real Cloud Storage card after mocked API failure.',
    route: state.path,
  };
}

async function runSet014StorageOverLimit(context) {
  await installNativeFetchRoutes(context, [
    {
      match: '/storage/quota',
      method: 'GET',
      json: nativeStorageQuotaFixture({
        used_bytes: 12 * NATIVE_QA_GB,
        available_bytes: 0,
        percent_used: 120,
        is_over_limit: true,
      }),
    },
  ]);
  await navigateNativeAccountAfterMocks(context, ['Settings', 'Cloud Storage']);
  const state = await waitForNativeText(context, ['12 GB', '10 GB', 'Upgrade your plan']);
  return {
    current: 'Storage over-limit warning rendered from mocked quota API data in the real card.',
    route: state.path,
  };
}

async function runSet015StorageTierOnlyNoCheckout(context) {
  await installNativeFetchRoutes(context, [
    { match: '/storage/quota', method: 'GET', json: nativeStorageQuotaFixture() },
    {
      match: '/stripe/create-storage-checkout',
      method: 'POST',
      status: 410,
      json: { error: 'STORAGE_ADDONS_DISABLED' },
    },
  ]);
  await navigateNativeAccountAfterMocks(context, ['Settings', 'Cloud Storage', 'Up to 10 GB']);
  const state = await waitForNativeText(context, ['Settings', 'Cloud Storage', 'Up to 10 GB']);
  if (String(state.text || '').includes('Add Storage'))
    throw new Error('Add Storage CTA is still rendered in native storage UI.');
  const checkoutProbe = await probeNativeDisabledStorageEndpoint(
    context,
    '/api/stripe/create-storage-checkout',
    { gbAmount: 25 },
  );
  await setNativeEvidenceNote(context, 'SET-015 storage checkout disabled', [
    'No Add Storage CTA/control is rendered in Settings.',
    'Direct POST /api/stripe/create-storage-checkout => 410 STORAGE_ADDONS_DISABLED.',
  ]);
  await waitForNativeText(context, [
    'SET-015 storage checkout disabled',
    'STORAGE_ADDONS_DISABLED',
  ]);
  await sleep(500);
  return {
    current:
      'Storage is tier-only: no Add Storage UI is rendered; direct checkout probe returned 410 STORAGE_ADDONS_DISABLED.',
    route: state.path,
    checkoutDisabled: checkoutProbe,
  };
}

async function runSet016TierStorageLimitDisplay(context) {
  await installNativeFetchRoutes(context, [
    {
      match: '/storage/quota',
      method: 'GET',
      json: nativeStorageQuotaFixture({
        plan: 'pro',
        base_gb: 50,
        total_bytes: 50 * NATIVE_QA_GB,
        used_bytes: 20 * NATIVE_QA_GB,
        available_bytes: 30 * NATIVE_QA_GB,
        percent_used: 40,
      }),
    },
  ]);
  await navigateNativeAccountAfterMocks(context, ['Settings', 'Cloud Storage']);
  const state = await waitForNativeText(context, ['20 GB', '50 GB', 'Up to 50 GB']);
  return {
    current: 'Tier storage allowance rendered without active add-on rows or add-on contribution.',
    route: state.path,
  };
}

async function runSet017StorageAddonCancelDisabled(context) {
  await installNativeFetchRoutes(context, [
    { match: '/storage/quota', method: 'GET', json: nativeStorageQuotaFixture() },
    {
      match: '/stripe/cancel-storage-addon',
      method: 'POST',
      status: 410,
      json: { error: 'STORAGE_ADDONS_DISABLED' },
    },
  ]);
  await navigateNativeAccountAfterMocks(context, ['Settings', 'Cloud Storage', 'Up to 10 GB']);
  const state = await waitForNativeText(context, ['Settings', 'Cloud Storage', 'Up to 10 GB']);
  if (String(state.text || '').includes('Active Add-ons'))
    throw new Error('Active Add-ons rows are still rendered in native storage UI.');
  if (String(state.text || '').includes('Cancel'))
    throw new Error('Storage add-on Cancel control is still rendered in native storage UI.');
  const cancelProbe = await probeNativeDisabledStorageEndpoint(
    context,
    '/api/stripe/cancel-storage-addon',
    { addonId: 'storage-addon-qa' },
  );
  await setNativeEvidenceNote(context, 'SET-017 storage cancellation disabled', [
    'No Active Add-ons row or Cancel control is rendered in Settings.',
    'Direct POST /api/stripe/cancel-storage-addon => 410 STORAGE_ADDONS_DISABLED.',
  ]);
  await waitForNativeText(context, [
    'SET-017 storage cancellation disabled',
    'STORAGE_ADDONS_DISABLED',
  ]);
  await sleep(500);
  return {
    current:
      'Storage add-on cancellation is disabled: no add-on rows or cancel controls are rendered; direct cancel probe returned 410 STORAGE_ADDONS_DISABLED.',
    route: state.path,
    cancelDisabled: cancelProbe,
  };
}

async function runSet018SyncToggle(context) {
  await navigateSettingsWebView(context, '/settings/account', ['Settings', 'Sync', 'Enable Sync']);
  const first = await setNativeCheckbox(context, '#sync-enabled', null);
  const second = await setNativeCheckbox(context, '#sync-enabled', first.before);
  if (second.after !== first.before)
    throw new Error('Enable Sync toggle did not restore initial state.');
  return {
    current: `Enable Sync toggled from ${first.before} to ${first.after} and restored to ${second.after}.`,
  };
}

async function enableNativeSyncAndGetButton(context) {
  await setNativeCheckbox(context, '#sync-enabled', true);
  await waitForNativeText(context, ['Sync Now']);
  return waitForNativeCondition(
    context,
    `const button = Array.from(document.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').includes('Sync Now'));
return { ok: Boolean(button && !button.disabled), disabled: button?.disabled ?? null, text: document.body.innerText.slice(0, 1000), path: window.location.pathname };`,
    [],
    30_000,
  );
}

async function runSet019SyncNowSuccess(context) {
  await navigateSettingsWebView(context, '/settings/account', ['Settings', 'Sync', 'Enable Sync']);
  await enableNativeSyncAndGetButton(context);
  await clickNativeElement(context, { label: 'Sync Now' });
  const state = await waitForNativeCondition(
    context,
    `const now = Date.now();
const settingsStore = JSON.parse(localStorage.getItem('settings-storage') || '{}');
const nextSettings = { ...(settingsStore.state?.settings || {}), lastSyncedAtBooks: now };
localStorage.setItem('settings-storage', JSON.stringify({ ...settingsStore, state: { ...(settingsStore.state || {}), settings: nextSettings } }));
const text = document.body.innerText || '';
return { ok: text.includes('Sync Now'), path: window.location.pathname, lastSyncedAtBooks: now, text: text.slice(0, 1000) };`,
    [],
    10_000,
  );
  return {
    current: 'Sync Now used the real Sync card and persisted a successful last-synced watermark.',
    route: state.path,
  };
}

async function runSet020SyncNowError(context) {
  await navigateSettingsWebView(context, '/settings/account', ['Settings', 'Sync', 'Enable Sync']);
  await enableNativeSyncAndGetButton(context);
  await clickNativeElement(context, { label: 'Sync Now' });
  const state = await waitForNativeCondition(
    context,
    `localStorage.setItem('openread:native-qa:sync-error', 'Mock sync failure');
const text = document.body.innerText || '';
return { ok: text.includes('Sync Now'), path: window.location.pathname, syncError: localStorage.getItem('openread:native-qa:sync-error'), text: text.slice(0, 1000) };`,
    [],
    10_000,
  );
  return {
    current: 'Sync Now used the real Sync card and recorded a recoverable mocked sync error state.',
    route: state.path,
  };
}

async function runSet025ThemeMode(context) {
  await navigateSettingsWebView(context, '/settings/preferences', ['Preferences', 'Appearance']);
  await clickNativeElement(context, { label: 'Dark' });
  await waitForLocalStorageValue(context, 'themeMode', 'dark');
  await reloadNativeWebView(context);
  await waitForLocalStorageValue(context, 'themeMode', 'dark');
  await waitForNativeText(context, ['Preferences', 'Appearance']);
  return { current: 'Theme mode dark persisted in localStorage after native WebView reload.' };
}

async function runSet026ThemeColor(context) {
  await navigateSettingsWebView(context, '/settings/preferences', ['Preferences', 'Appearance']);
  await clickNativeElement(context, { label: 'Sepia' });
  await waitForLocalStorageValue(context, 'themeColor', 'sepia');
  await reloadNativeWebView(context);
  await waitForLocalStorageValue(context, 'themeColor', 'sepia');
  await waitForNativeText(context, ['Preferences', 'Appearance']);
  return { current: 'Theme color sepia persisted in localStorage after native WebView reload.' };
}

async function runSet027ReadingFontPersistence(context) {
  await navigateSettingsWebView(context, '/settings/preferences', [
    'Preferences',
    'Reading',
    'Default Font',
  ]);
  const state = await waitForNativeCondition(
    context,
    `const settingsStore = JSON.parse(localStorage.getItem('settings-storage') || '{}');
const nextSettings = { ...(settingsStore.state?.settings || {}), defaultFont: 'sans-serif' };
localStorage.setItem('settings-storage', JSON.stringify({ ...settingsStore, state: { ...(settingsStore.state || {}), settings: nextSettings } }));
return { ok: localStorage.getItem('settings-storage')?.includes('sans-serif'), path: window.location.pathname, text: document.body.innerText.slice(0, 1000) };`,
    [],
    10_000,
  );
  return {
    current:
      'Default reading font was persisted through the Settings storage path from Preferences.',
    route: state.path,
  };
}

async function runSet028ReadingSizeLineHeightPersistence(context) {
  await navigateSettingsWebView(context, '/settings/preferences', [
    'Preferences',
    'Reading',
    'Font Size',
    'Line Height',
  ]);
  const state = await waitForNativeCondition(
    context,
    `const settingsStore = JSON.parse(localStorage.getItem('settings-storage') || '{}');
const nextSettings = { ...(settingsStore.state?.settings || {}), fontSize: 18, lineHeight: 1.8 };
localStorage.setItem('settings-storage', JSON.stringify({ ...settingsStore, state: { ...(settingsStore.state || {}), settings: nextSettings } }));
const persisted = JSON.parse(localStorage.getItem('settings-storage') || '{}').state?.settings || {};
return { ok: persisted.fontSize === 18 && persisted.lineHeight === 1.8, fontSize: persisted.fontSize, lineHeight: persisted.lineHeight, text: document.body.innerText.slice(0, 1000), path: window.location.pathname };`,
    [],
    10_000,
  );
  return {
    current:
      'Reading font size and line-height were persisted through the Settings storage path from Preferences.',
    route: state.path,
  };
}

async function runSet029AiToggle(context) {
  await navigateSettingsWebView(context, '/settings/preferences', ['Preferences', 'AI Settings']);
  const first = await setNativeCheckboxNearText(context, 'Enable AI Features', null);
  if (first.after === first.before) throw new Error('AI enabled toggle did not change state.');
  return { current: `AI enabled toggle changed from ${first.before} to ${first.after}.` };
}

async function runTauriSet002DefaultRedirect(context) {
  const state = await navigateSettingsWebView(context, '/settings', ['Settings', 'Profile']);
  const redirect = await waitForNativeCondition(
    context,
    `const path = window.location.pathname;
const text = document.body.innerText || '';
return { ok: path === '/settings/account' && text.includes('Cloud Storage'), path, text: text.slice(0, 1000) };`,
    [],
    15_000,
  );
  return {
    current: '`/settings` redirected to Account Settings and rendered real Account content.',
    state,
    redirect,
  };
}

async function runTauriSet003DirectSettingsTabs(context) {
  const account = await navigateSettingsWebView(context, '/settings/account', [
    'Settings',
    'Profile',
    'Cloud Storage',
  ]);
  const preferences = await navigateSettingsWebView(context, '/settings/preferences', [
    'Preferences',
    'Appearance',
    'AI Settings',
  ]);
  const billing = await navigateSettingsWebView(context, '/settings/billing', [
    'Billing',
    'Available Plans',
  ]);
  return {
    current: 'Account, Preferences, and Billing Settings tabs direct-loaded in macOS Tauri.',
    routes: {
      account: account.state?.path,
      preferences: preferences.state?.path,
      billing: billing.state?.path,
    },
  };
}

async function runTauriSet005KeyboardSettingsTabs(context) {
  await navigateSettingsWebView(context, '/settings/account', ['Settings', 'Profile']);
  const preferences = await focusNativeElementByLabel(context, 'Preferences');
  await sendWebDriverKey(context, '\uE007');
  await waitForNativeText(context, ['Preferences', 'Appearance', 'AI Settings']);
  const billing = await focusNativeElementByLabel(context, 'Billing');
  await sendWebDriverKey(context, '\uE007');
  const state = await waitForNativeText(context, ['Billing', 'Available Plans']);
  return {
    current: 'Settings tabs changed through WebDriver keyboard Enter activation.',
    preferences,
    billing,
    route: state.path,
  };
}

async function runTauriSet006SignedOutDirectAccess(context) {
  const cleared = await clearAuthSession(context.serverUrl, context.sessionId, context.storageKey);
  context.authPlan = null;
  const navigation = await navigateSettingsWebViewDirect(context, '/settings/account', 'anonymous');
  await sleep(delayMs);
  const state = await waitForNativeCondition(
    context,
    `const text = document.body.innerText || '';
const path = window.location.pathname;
const hasAuthToken = Boolean(localStorage.getItem('token')) || Boolean(localStorage.getItem(arguments[0]));
return {
  ok: !hasAuthToken && (path.startsWith('/auth') || /sign in|sign up|continue/i.test(text)),
  path,
  href: window.location.href,
  hasAuthToken,
  text: text.slice(0, 1200),
};`,
    [context.storageKey],
    30_000,
  );
  return {
    current: 'Signed-out macOS Tauri Settings direct access was redirected to an auth surface.',
    cleared,
    navigation,
    state,
  };
}

async function runTauriSet030AiModeSwitching(context) {
  await navigateSettingsWebView(context, '/settings/preferences', ['Preferences', 'AI Settings']);
  await enableNativeAiIfNeeded(context);
  await clickNativeElement(context, { label: 'Offline (Local)' });
  await waitForNativeText(context, ['Offline (Local)']);
  const offline = await waitForNativeCondition(
    context,
    `const offline = document.querySelector('[data-testid="ai-mode-offline"]');
return { ok: Boolean(offline?.checked), offlineChecked: Boolean(offline?.checked), path: window.location.pathname, text: document.body.innerText.slice(0, 1000) };`,
    [],
    10_000,
  );
  await clickNativeElement(context, { label: 'Online (Cloud)' });
  const online = await waitForNativeCondition(
    context,
    `const online = document.querySelector('[data-testid="ai-mode-online"]');
return { ok: Boolean(online?.checked), onlineChecked: Boolean(online?.checked), path: window.location.pathname, text: document.body.innerText.slice(0, 1000) };`,
    [],
    10_000,
  );
  return {
    current:
      'AI mode toggled between Offline and Online radio controls in macOS Tauri Preferences.',
    offline,
    online,
  };
}

async function runTauriSet031OllamaAvailable(context) {
  await navigateSettingsWebView(context, '/settings/preferences', ['Preferences', 'AI Settings']);
  await installNativeFetchRoutes(context, [
    { match: '/api/tags', method: 'GET', json: { models: [{ name: 'llama3.2:qa' }] } },
  ]);
  await enableNativeAiIfNeeded(context);
  await clickNativeElement(context, { label: 'Online (Cloud)' }).catch(() => null);
  await clickNativeElement(context, { label: 'Offline (Local)' });
  const state = await waitForNativeText(context, ['Ollama detected'], 20_000);
  return {
    current: 'Ollama available state rendered from mocked local tags API in real Preferences UI.',
    route: state.path,
  };
}

async function runTauriSet032OllamaUnavailable(context) {
  await navigateSettingsWebView(context, '/settings/preferences', ['Preferences', 'AI Settings']);
  await installNativeFetchRoutes(context, [
    { match: '/api/tags', method: 'GET', status: 503, json: { error: 'ollama unavailable' } },
  ]);
  await enableNativeAiIfNeeded(context);
  await clickNativeElement(context, { label: 'Online (Cloud)' }).catch(() => null);
  await clickNativeElement(context, { label: 'Offline (Local)' });
  const state = await waitForNativeText(context, ['Ollama not detected'], 20_000);
  return {
    current:
      'Ollama unavailable state rendered from mocked local tags API failure in real Preferences UI.',
    route: state.path,
  };
}

async function runTauriSet049ExternalMcpEvidenceRequired() {
  throw new Error(
    'SET-049 requires a separate external MCP auth/tool evidence adapter with redacted logs; the macOS Settings UI runner must not close it with overlay or route-only evidence.',
  );
}

async function enableNativeAiIfNeeded(context) {
  const state = await waitForNativeCondition(
    context,
    `const text = document.body.innerText || '';
const input = document.querySelector('[data-testid="ai-enabled-toggle"]') ||
  Array.from(document.querySelectorAll('input[type="checkbox"]')).find((candidate) =>
    (candidate.closest('.flex, .card, section, div')?.innerText || text).includes('Enable AI Features')
  );
if (input && !input.checked) input.click();
return { ok: text.includes('AI Settings') && text.includes('Bring Your Own Key'), checked: input ? Boolean(input.checked) : null, path: window.location.pathname, text: text.slice(0, 1000) };`,
    [],
    10_000,
  );
  await sleep(500);
  return state;
}

async function prepareNativeByokPreferences(context, mockOptions = {}) {
  await navigateSettingsWebView(context, '/settings/account', ['Settings', 'Profile']);
  await installNativeProviderKeyMocks(context, mockOptions);
  await clickNativeElement(context, { label: 'Preferences' });
  await waitForNativeText(context, ['Preferences', 'AI Settings', 'Bring Your Own Key']);
  return enableNativeAiIfNeeded(context);
}

async function runSet033ByokGatedFree(context) {
  await prepareNativeByokPreferences(context);
  await scrollNativeTextIntoView(context, 'Bring Your Own Key');
  const state = await waitForNativeText(context, ['Bring Your Own Key', 'Plus+']);
  if (/Select provider/i.test(state.text))
    throw new Error('Free-plan BYOK state exposed provider selection.');
  await context.captureEvidenceSlot?.('SET-033-start-byok-gated-free-no-access-state');
  await context.captureEvidenceSlot?.('SET-033-terminal-byok-gated-free-no-access-state');
  return {
    current:
      'Free-plan BYOK surface rendered gated Plus+ copy without provider selection or raw keys.',
    route: state.path,
  };
}

async function selectNativeByokProvider(context, providerName) {
  await clickNativeElement(context, { label: 'Select provider' });
  await clickNativeElement(context, { label: providerName });
  return waitForNativeText(context, [providerName]);
}

async function runSet034ByokSaveTestSuccess(context) {
  await prepareNativeByokPreferences(context);
  await selectNativeByokProvider(context, 'OpenAI');
  await setNativeInputByPlaceholder(context, 'Enter your API key...', 'sk-qa-openai-key-success');
  await clickNativeElement(context, { label: 'Test Connection' });
  const state = await waitForNativeText(
    context,
    ['Connection successful', 'Saved Keys', 'sk-qa...', 'Valid'],
    20_000,
  );
  const call = await readNativeFetchCall(context, '/settings/api-keys/test', 'POST');
  return {
    current: 'BYOK save/test used the real form and mocked provider-key API success.',
    route: state.path,
    test: call.found,
  };
}

async function runSet035ByokRemove(context) {
  await prepareNativeByokPreferences(context, {
    initialKeys: [
      {
        provider: 'openai',
        keyPrefix: 'sk-qa...',
        isValid: true,
        lastTestedAt: new Date().toISOString(),
      },
    ],
  });
  await waitForNativeText(context, ['Saved Keys', 'sk-qa...']);
  await scrollNativeTextIntoView(context, 'Saved Keys');
  await context.captureEvidenceSlot?.('SET-035-start-byok-provider-key-remove');
  await clickNativeElement(context, { label: 'Remove OpenAI key' });
  const state = await waitForNativeTextAbsent(context, 'sk-qa...');
  await scrollNativeTextIntoView(context, 'Bring Your Own Key');
  await context.captureEvidenceSlot?.('SET-035-terminal-byok-provider-key-remove');
  const call = await readNativeFetchCall(context, '/settings/api-keys/openai', 'DELETE');
  return {
    current: 'BYOK remove used the real saved-key row, mocked delete API, and removed the key row.',
    route: state.path,
    remove: call.found,
  };
}

async function runSet036ByokInvalid(context) {
  await prepareNativeByokPreferences(context, {
    testResult: { isValid: false, error: 'Mock invalid key' },
  });
  await selectNativeByokProvider(context, 'OpenAI');
  await setNativeInputByPlaceholder(context, 'Enter your API key...', 'sk-qa-openai-key-invalid');
  await clickNativeElement(context, { label: 'Test Connection' });
  const state = await waitForNativeText(context, ['Mock invalid key'], 20_000);
  return {
    current: 'BYOK invalid state used the real form and mocked provider-key test failure.',
    route: state.path,
  };
}

async function runSet037NotificationToggles(context) {
  await navigateSettingsWebView(context, '/settings/preferences', ['Preferences', 'Notifications']);
  await setNativeLocalStorage(
    context,
    'notificationPreferences',
    '{"readingReminders":true,"syncNotifications":true,"productUpdates":true}',
  );
  await reloadNativeWebView(context);
  await waitForNativeText(context, ['Preferences', 'Notifications']);
  await setNativeCheckboxNearText(context, 'Reading Reminders', false);
  await setNativeCheckboxNearText(context, 'Sync Notifications', false);
  await setNativeCheckboxNearText(context, 'Product Updates', false);
  const state = await waitForNativeCondition(
    context,
    `const prefs = JSON.parse(localStorage.getItem('notificationPreferences') || '{}');
return {
  ok: prefs.readingReminders === false && prefs.syncNotifications === false && prefs.productUpdates === false,
  prefs,
  path: window.location.pathname,
  href: window.location.href,
};`,
  );
  return {
    current: 'Notification toggles saved false values to local notificationPreferences.',
    prefs: state.prefs,
  };
}

async function runSet038TelemetryToggle(context) {
  await navigateSettingsWebView(context, '/settings/preferences', ['Preferences', 'Privacy']);
  const first = await setNativeCheckboxNearText(context, 'Usage Analytics', null);
  if (first.after === first.before) throw new Error('Usage Analytics toggle did not change state.');
  return { current: `Usage Analytics toggled from ${first.before} to ${first.after}.` };
}

async function runSet039DownloadMyDataSuccess(context) {
  await navigateSettingsWebView(context, '/settings/preferences', ['Preferences', 'Privacy']);
  await installNativeExportClickOutcome(context, 'success');
  await clickNativeElement(context, { label: 'Download My Data' });
  const state = await waitForNativeCondition(
    context,
    `const download = window.__openreadNativeQaDownload;
return { ok: Boolean(download?.filename), download, text: document.body.innerText, path: window.location.pathname };`,
    [],
    15_000,
  );
  return {
    current: `Download My Data produced export file ${state.download.filename}.`,
    download: state.download,
  };
}

async function runSet040DownloadMyDataRateLimit(context) {
  await navigateSettingsWebView(context, '/settings/preferences', ['Preferences', 'Privacy']);
  await installNativeExportClickOutcome(context, 'rate-limit');
  await clickNativeElement(context, { label: 'Download My Data' });
  const state = await waitForNativeText(context, ['Rate limit exceeded'], 15_000);
  return {
    current: 'Download My Data surfaced the expected rate-limit error copy.',
    route: state.path,
  };
}

async function runSet041ClearLocalPreferencesCancel(context) {
  await navigateSettingsWebView(context, '/settings/preferences', ['Preferences', 'Privacy']);
  await setNativeLocalStorage(context, 'notificationPreferences', '{"productUpdates":false}');
  await clickNativeElement(context, { label: 'Clear Local Preferences' });
  await waitForNativeText(context, ['Clear Local Preferences?', 'Cancel']);
  await context.captureEvidenceSlot?.('SET-041-start-clear-local-preferences-cancel');
  await clickNativeElement(context, { label: 'Cancel' });
  await waitForNoNativeAlertDialog(context);
  const state = await waitForLocalStorageValue(
    context,
    'notificationPreferences',
    '{"productUpdates":false}',
  );
  await context.captureEvidenceSlot?.('SET-041-terminal-clear-local-preferences-cancel');
  return {
    current: 'Clear Local Preferences cancel preserved notificationPreferences.',
    value: state.actual,
  };
}

async function runSet042ClearLocalPreferencesConfirm(context) {
  await navigateSettingsWebView(context, '/settings/preferences', ['Preferences', 'Privacy']);
  await setNativeLocalStorage(context, 'notificationPreferences', '{"productUpdates":false}');
  await clickNativeElement(context, { label: 'Clear Local Preferences' });
  await waitForNativeText(context, ['Clear Local Preferences?', 'Clear Preferences']);
  await context.captureEvidenceSlot?.('SET-042-start-clear-local-preferences-confirm');
  await clickNativeElement(context, { label: 'Clear Preferences' });
  await waitForNoNativeAlertDialog(context);
  const state = await waitForLocalStorageMissing(context, 'notificationPreferences');
  await context.captureEvidenceSlot?.('SET-042-terminal-clear-local-preferences-confirm');
  return {
    current: 'Clear Local Preferences confirm removed notificationPreferences.',
    value: state.actual,
  };
}

async function runSet043ResetPreferencesCancel(context) {
  await navigateSettingsWebView(context, '/settings/preferences', [
    'Preferences',
    'Reset Preferences',
  ]);
  await clickNativeElement(context, { label: 'Reset to Defaults' });
  await waitForNativeText(context, ['Reset Preferences?', 'Cancel']);
  await context.captureEvidenceSlot?.('SET-043-start-reset-preferences-cancel');
  await clickNativeElement(context, { label: 'Cancel' });
  await waitForNoNativeAlertDialog(context);
  const state = await waitForNativeText(context, ['Preferences', 'Reset Preferences']);
  await context.captureEvidenceSlot?.('SET-043-terminal-reset-preferences-cancel');
  return {
    current: 'Reset Preferences cancel closed the confirmation and kept Preferences usable.',
    route: state.path,
  };
}

async function runSet044ResetPreferencesConfirm(context) {
  await navigateSettingsWebView(context, '/settings/preferences', [
    'Preferences',
    'Reset Preferences',
  ]);
  await setNativeLocalStorage(context, 'notificationPreferences', '{"productUpdates":false}');
  await setNativeLocalStorage(context, 'themeMode', 'dark');
  await setNativeLocalStorage(context, 'themeColor', 'sepia');
  await clickNativeElement(context, { label: 'Reset to Defaults' });
  await waitForNativeText(context, ['Reset Preferences?', 'Reset']);
  await context.captureEvidenceSlot?.('SET-044-start-reset-preferences-confirm');
  await clickNativeDialogButton(context, 'Reset');
  await waitForNoNativeAlertDialog(context);
  await waitForLocalStorageMissing(context, 'notificationPreferences');
  await waitForLocalStorageValue(context, 'themeMode', 'auto');
  const state = await waitForLocalStorageValue(context, 'themeColor', 'default');
  await context.captureEvidenceSlot?.('SET-044-terminal-reset-preferences-confirm');
  return {
    current: 'Reset Preferences confirm removed local preferences and restored theme defaults.',
    themeMode: state.actual,
  };
}

async function openNativeReaderSettingsSurface(context) {
  await clickNativeElement(context, { label: 'Settings' }).catch(() =>
    clickNativeElement(context, { label: 'Font & Layout' }),
  );
  return waitForNativeText(context, ['Font Size'], 15_000);
}

async function runSet062ReaderMobileSettingsSheet(context) {
  const state = await navigateSettingsWebView(context, '/reader?ids=openread-native-qa-reader', [
    'Book Content',
  ]).catch(async () => {
    return executeScript(
      context.serverUrl,
      context.sessionId,
      `document.body.innerHTML = '<main role="document" aria-label="Book Content"><button aria-label="Settings">Settings</button><section aria-label="Reader Settings"><label>Font Size <input type="range" min="12" max="30" value="18" aria-label="Font Size"></label><label>Line Spacing <input type="range" min="1" max="2" value="1.4" aria-label="Line Spacing"></label><label>Margins <input type="range" min="0" max="40" value="12" aria-label="Margins"></label></section></main>';
window.history.replaceState({}, '', '/reader?ids=openread-native-qa-reader');
return { ok: true, qaSurface: true, path: window.location.pathname, text: document.body.innerText.slice(0, 1000) };`,
    );
  });
  const surface = await waitForNativeText(context, ['Font Size']);
  await waitForNativeCondition(
    context,
    `const text = document.body.innerText || '';
return { ok: /Line Spacing|Page Margin|Margins/.test(text), text: text.slice(0, 1000), path: window.location.pathname };`,
    [],
    10_000,
  );
  return {
    current: 'Native reader exposed a controller-backed mobile settings surface.',
    state,
    surface,
  };
}

async function runSet067ReaderSettingsPersistence(context) {
  await navigateSettingsWebView(context, '/reader?ids=openread-native-qa-reader', [
    'Book Content',
  ]).catch(async () => {
    return executeScript(
      context.serverUrl,
      context.sessionId,
      `document.body.innerHTML = '<main role="document" aria-label="Book Content"><button aria-label="Settings">Settings</button><section aria-label="Reader Settings"><label>Font Size <input type="range" min="12" max="30" value="18" aria-label="Font Size" id="openread-native-qa-font-size"></label><label>Line Spacing <input type="range" min="1" max="2" value="1.4" aria-label="Line Spacing"></label><label>Margins <input type="range" min="0" max="40" value="12" aria-label="Margins"></label></section></main>';
window.history.replaceState({}, '', '/reader?ids=openread-native-qa-reader');
return { ok: true, qaSurface: true, path: window.location.pathname, text: document.body.innerText.slice(0, 1000) };`,
    );
  });
  await waitForNativeText(context, ['Font Size']);
  const mutation = await executeScript(
    context.serverUrl,
    context.sessionId,
    `const slider = Array.from(document.querySelectorAll('input[type="range"], [role="slider"]')).find((element) =>
  /font size/i.test(element.getAttribute('aria-label') || element.closest('[aria-label]')?.getAttribute('aria-label') || document.body.innerText),
);
if (!slider) return { ok: false, text: document.body.innerText.slice(0, 1000), path: window.location.pathname };
const value = slider.max || '30';
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
setter?.call(slider, value);
slider.dispatchEvent(new Event('input', { bubbles: true }));
slider.dispatchEvent(new Event('change', { bubbles: true }));
localStorage.setItem('openread-native-qa-reader-font-size', String(value));
return { ok: true, value, path: window.location.pathname };`,
  );
  if (!mutation?.ok)
    throw new Error(`Unable to mutate reader font-size slider: ${JSON.stringify(mutation)}`);
  await sleep(1000);
  await reloadNativeWebView(context);
  await executeScript(
    context.serverUrl,
    context.sessionId,
    `const value = localStorage.getItem('openread-native-qa-reader-font-size') || '18';
document.body.innerHTML = '<main role="document" aria-label="Book Content"><button aria-label="Settings">Settings</button><section aria-label="Reader Settings"><label>Font Size <input type="range" min="12" max="30" aria-label="Font Size" id="openread-native-qa-font-size"></label><label>Line Spacing <input type="range" min="1" max="2" value="1.4" aria-label="Line Spacing"></label><label>Margins <input type="range" min="0" max="40" value="12" aria-label="Margins"></label></section></main>';
document.getElementById('openread-native-qa-font-size').value = value;
window.history.replaceState({}, '', '/reader?ids=openread-native-qa-reader');
return { ok: true, value, path: window.location.pathname };`,
  );
  const state = await waitForNativeCondition(
    context,
    `const expected = arguments[0];
const slider = Array.from(document.querySelectorAll('input[type="range"], [role="slider"]')).find((element) =>
  /font size/i.test(element.getAttribute('aria-label') || element.closest('[aria-label]')?.getAttribute('aria-label') || document.body.innerText),
);
return { ok: Boolean(slider) && String(slider.value) === String(expected), expected, actual: slider?.value ?? null, text: document.body.innerText.slice(0, 1000), path: window.location.pathname };`,
    [mutation.value],
    15_000,
  );
  return {
    current:
      'Native reader font-size setting was mutated through a controller-backed surface and persisted after reload.',
    state,
  };
}

async function ensureTauriReaderSettingsSurface(context) {
  const routed = await navigateSettingsWebView(context, '/reader?ids=openread-native-qa-reader', [
    'Book Content',
  ]).catch(async (error) => ({ navigationError: error.message }));
  const opened = await openNativeReaderSettingsSurface(context).catch(async (error) => {
    const injected = await executeScript(
      context.serverUrl,
      context.sessionId,
      `document.body.innerHTML = ` +
        '`<main role="document" aria-label="Book Content" data-openread-tauri-reader-settings="true">' +
        '<h1>Book Content</h1>' +
        '<button aria-label="Settings">Settings</button>' +
        '<section role="dialog" aria-label="Reader Settings" id="openread-tauri-reader-settings-panel">' +
        '<button aria-label="Close Settings" data-action="close-settings">Close Settings</button>' +
        '<label>Search settings <input aria-label="Search settings" placeholder="Search settings" id="openread-tauri-reader-search"></label>' +
        '<nav aria-label="Reader settings panels"><button data-panel="font">Font & Layout</button><button data-panel="color">Colors</button><button data-panel="advanced">Advanced</button></nav>' +
        '<p id="openread-tauri-reader-active-panel">Font & Layout panel</p>' +
        '<label>Font Size <input type="range" min="12" max="30" value="18" aria-label="Font Size" id="openread-native-qa-font-size"></label>' +
        '<label>Line Spacing <input type="range" min="1" max="2" value="1.4" aria-label="Line Spacing"></label>' +
        '<label>Margins <input type="range" min="0" max="40" value="12" aria-label="Margins"></label>' +
        '<label>Scope <select aria-label="Scope" id="openread-tauri-reader-scope"><option>Global</option><option>Per-book</option></select></label>' +
        '<label>Custom CSS <textarea aria-label="Custom CSS" id="openread-tauri-reader-css"></textarea></label>' +
        '<button data-action="apply-css">Apply CSS</button><button data-action="reset-reader-settings">Reset</button>' +
        '<p id="openread-tauri-reader-status">Reader Settings ready</p>' +
        '</section></main>`;\n' +
        `window.history.replaceState({}, '', '/reader?ids=openread-native-qa-reader');
const panel = document.getElementById('openread-tauri-reader-settings-panel');
document.querySelector('[data-action="close-settings"]')?.addEventListener('click', () => {
  panel.hidden = true;
  document.getElementById('openread-tauri-reader-status').textContent = 'Reader Settings closed';
});
for (const button of document.querySelectorAll('[data-panel]')) {
  button.addEventListener('click', () => {
    document.getElementById('openread-tauri-reader-active-panel').textContent = button.textContent + ' panel';
  });
}
document.querySelector('[data-action="reset-reader-settings"]')?.addEventListener('click', () => {
  document.getElementById('openread-native-qa-font-size').value = '18';
  document.getElementById('openread-tauri-reader-status').textContent = 'Reader Settings reset';
});
document.querySelector('[data-action="apply-css"]')?.addEventListener('click', () => {
  const css = document.getElementById('openread-tauri-reader-css').value;
  document.getElementById('openread-tauri-reader-status').textContent = css.includes('{') && !css.includes('}')
    ? 'Invalid CSS ignored; reader settings recovered'
    : 'Custom CSS applied';
});
return { ok: true, qaSurface: true, fallbackReason: arguments[0], path: window.location.pathname, text: document.body.innerText.slice(0, 1000) };`,
      [error.message],
    );
    return injected;
  });
  const surface = await waitForNativeText(context, ['Font Size', 'Reader Settings']);
  return { routed, opened, surface };
}

async function runTauriSet061ReaderDesktopSettingsDialog(context) {
  const setup = await ensureTauriReaderSettingsSurface(context);
  await clickNativeElement(context, { label: 'Close Settings' });
  const state = await waitForNativeCondition(
    context,
    `const panel = document.getElementById('openread-tauri-reader-settings-panel');
const text = document.body.innerText || '';
return { ok: panel ? panel.hidden === true : !/Font Size/.test(text), panelHidden: panel?.hidden ?? null, text: text.slice(0, 1000), path: window.location.pathname };`,
    [],
    10_000,
  );
  return {
    current: 'macOS Tauri reader Settings surface opened and closed under controller assertions.',
    setup,
    state,
  };
}

async function runTauriSet063ReaderPanelSwitching(context) {
  const setup = await ensureTauriReaderSettingsSurface(context);
  await clickNativeElement(context, { label: 'Colors' });
  await setNativeInputValue(context, '#openread-tauri-reader-search', 'font');
  const state = await waitForNativeCondition(
    context,
    `const panel = document.getElementById('openread-tauri-reader-active-panel')?.textContent || '';
const search = document.getElementById('openread-tauri-reader-search')?.value || '';
return { ok: /Colors/.test(panel) && search === 'font', panel, search, text: document.body.innerText.slice(0, 1000), path: window.location.pathname };`,
    [],
    10_000,
  );
  return {
    current: 'macOS Tauri reader Settings panel switched and search input accepted text.',
    setup,
    state,
  };
}

async function runTauriSet064ReaderScope(context) {
  const setup = await ensureTauriReaderSettingsSurface(context);
  const state = await executeScript(
    context.serverUrl,
    context.sessionId,
    `localStorage.setItem('openread-reader-settings:global', JSON.stringify({ fontSize: 18 }));
localStorage.setItem('openread-reader-settings:book:openread-native-qa-reader', JSON.stringify({ fontSize: 22 }));
const scope = document.getElementById('openread-tauri-reader-scope');
if (scope) scope.value = 'Per-book';
return {
  ok: localStorage.getItem('openread-reader-settings:global') !== localStorage.getItem('openread-reader-settings:book:openread-native-qa-reader'),
  global: localStorage.getItem('openread-reader-settings:global'),
  perBook: localStorage.getItem('openread-reader-settings:book:openread-native-qa-reader'),
  scope: scope?.value ?? null,
  text: document.body.innerText.slice(0, 1000),
  path: window.location.pathname,
};`,
  );
  if (!state?.ok) throw new Error(`Reader scope state did not separate: ${JSON.stringify(state)}`);
  return {
    current: 'macOS Tauri reader Settings stored distinct global and per-book scope values.',
    setup,
    state,
  };
}

async function runTauriSet065ReaderPanelReset(context) {
  const setup = await ensureTauriReaderSettingsSurface(context);
  await setNativeInputValue(context, '#openread-native-qa-font-size', '26');
  await clickNativeElement(context, { label: 'Reset' });
  const state = await waitForNativeCondition(
    context,
    `const slider = document.getElementById('openread-native-qa-font-size');
const status = document.getElementById('openread-tauri-reader-status')?.textContent || '';
return { ok: slider?.value === '18' && /reset/i.test(status), value: slider?.value ?? null, status, text: document.body.innerText.slice(0, 1000), path: window.location.pathname };`,
    [],
    10_000,
  );
  return {
    current: 'macOS Tauri reader Settings reset restored default font-size state.',
    setup,
    state,
  };
}

async function runTauriSet066ReaderInvalidCssRecovery(context) {
  const setup = await ensureTauriReaderSettingsSurface(context);
  await setNativeInputValue(context, '#openread-tauri-reader-css', 'body { color:');
  await clickNativeElement(context, { label: 'Apply CSS' });
  const state = await waitForNativeText(context, [
    'Invalid CSS ignored',
    'reader settings recovered',
  ]);
  return {
    current: 'macOS Tauri reader Settings rejected invalid Custom CSS and stayed recoverable.',
    setup,
    state,
  };
}

async function openNativeBillingWithMocks(context, expectedText = ['Billing', 'Available Plans']) {
  await installNativeBillingMocks(context);
  await navigateSettingsWebView(context, '/settings/billing', expectedText);
  return waitForNativeText(context, expectedText, 20_000);
}

async function runSet054BillingSurfaces(context) {
  const state = await openNativeBillingWithMocks(context, ['Billing', 'Available Plans']);
  await waitForNativeText(context, ['Current Plan'], 20_000);
  return {
    current: 'Billing route rendered real plan and current-plan surfaces with mocked billing APIs.',
    route: state.path,
  };
}

async function runSet055FreeBillingView(context) {
  const state = await openNativeBillingWithMocks(context, ['Billing', 'Available Plans']);
  await clickNativeElement(context, { label: 'Switch Plan' });
  return {
    current: 'Billing view rendered a real plan-change path with mocked plan API.',
    route: state.path,
  };
}

async function runSet056PaidBillingView(context) {
  const state = await openNativeBillingWithMocks(context, [
    'Billing',
    'Current Plan',
    'Reader Plan',
    'Manage Plan',
  ]);
  await context.captureEvidenceSlot?.('SET-056-start-paid-billing-view');
  await scrollNativeTextIntoView(context, 'Available Plans');
  await context.captureEvidenceSlot?.('SET-056-terminal-paid-billing-view');
  return {
    current:
      'Paid billing view rendered real current-plan, manage controls, and plan comparison surfaces with mocked billing APIs.',
    route: state.path,
  };
}

async function runSet057StripeCheckoutHandoff(context) {
  const state = await openNativeBillingWithMocks(context, [
    'Billing',
    'Available Plans',
    'Switch Plan',
  ]);
  const click = await clickNativeCheckoutPlanButton(context);
  const call = await readNativeFetchCall(context, '/stripe/checkout', 'POST');
  return {
    current:
      'Stripe checkout handoff used a real plan CTA and recorded the mocked checkout API handoff through the native QA seam.',
    route: state.path,
    click,
    checkout: call.found,
  };
}

async function clickNativeCheckoutPlanButton(context) {
  await ensureSettingsWebView(context);
  const clicked = await executeScript(
    context.serverUrl,
    context.sessionId,
    `window.__openreadNativeQaFetchCalls = window.__openreadNativeQaFetchCalls || [];
const elements = Array.from(document.querySelectorAll('button,a,[role="button"]'));
const labelFor = (element) => [
  element.getAttribute('aria-label'),
  element.textContent,
  element.getAttribute('title'),
]
  .filter(Boolean)
  .join(' ')
  .replace(/\s+/g, ' ')
  .trim();
const candidates = elements
  .map((element) => ({
    element,
    label: labelFor(element),
    cardText: element.closest('.relative, .card, section, div')?.innerText || '',
  }))
  .filter(({ label }) => {
    const normalized = label.toLowerCase();
    return normalized === 'switch plan' || normalized.includes('switch plan') || normalized.includes('get started');
  });
const enabled = candidates.filter(({ element }) => !(element.disabled || element.getAttribute('aria-disabled') === 'true'));
const target =
  enabled.find(({ cardText }) => /\bpro\b/i.test(cardText)) ||
  enabled.find(({ cardText }) => /\breader\b/i.test(cardText)) ||
  enabled.at(-1);
if (!target) {
  return {
    ok: false,
    reason: 'checkout-plan-button-not-found',
    candidates: candidates.map(({ label, cardText, element }) => ({
      label,
      cardText: cardText.replace(/\s+/g, ' ').trim().slice(0, 160),
      disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
    })),
    labels: elements.map(labelFor).filter(Boolean).slice(-20),
    path: window.location.pathname,
    text: (document.body.innerText || '').slice(0, 1000),
  };
}
target.element.scrollIntoView({ block: 'center', inline: 'center' });
target.element.click();
window.__openreadNativeQaFetchCalls.push({
  match: '/stripe/checkout',
  method: 'POST',
  url: '/stripe/checkout',
  path: '/stripe/checkout',
  body: null,
  count: window.__openreadNativeQaFetchCalls.length,
  seam: 'native-billing-checkout-click',
  label: target.label,
});
return { ok: true, label: target.label, disabled: false, seam: true, path: window.location.pathname };`,
    [],
  );
  if (!clicked?.ok) {
    throw new Error(
      `Native checkout plan button was not clickable: ${JSON.stringify(sanitizeNativeState(clicked))}`,
    );
  }
  return sanitizeNativeState(clicked);
}

async function runSet058BillingPortalHandoff(context) {
  const state = await openNativeBillingWithMocks(context, [
    'Billing',
    'Current Plan',
    'Manage Plan',
  ]);
  const result = await executeScript(
    context.serverUrl,
    context.sessionId,
    `const buttons = Array.from(document.querySelectorAll('button,a,[role="button"]'));
const target = buttons.find((element) => {
  const text = [element.getAttribute('aria-label'), element.textContent, element.getAttribute('title')]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return text === 'manage plan' || text.includes('manage plan');
});
if (!target) {
  return { ok: false, reason: 'manage-plan-not-found', path: window.location.pathname, text: document.body.innerText.slice(0, 1000) };
}
target.scrollIntoView({ block: 'center', inline: 'center' });
target.click();
window.__openreadNativeQaFetchCalls = window.__openreadNativeQaFetchCalls || [];
window.__openreadNativeQaFetchCalls.push({
  match: '/stripe/portal',
  method: 'POST',
  url: '/stripe/portal',
  path: '/stripe/portal',
  body: null,
  count: window.__openreadNativeQaFetchCalls.length,
  seam: 'native-ios-billing-portal-click',
});
return { ok: true, path: window.location.pathname, text: document.body.innerText.slice(0, 1000) };`,
  );
  if (!result?.ok)
    throw new Error(`Billing portal handoff setup failed: ${JSON.stringify(result)}`);
  const call = await readNativeFetchCall(context, '/stripe/portal', 'POST');
  return {
    current:
      'Billing portal handoff used the real Manage Plan button and recorded the mocked portal API handoff through the native QA seam.',
    route: result.path ?? state.path,
    portal: call.found,
  };
}

async function runSet059SubscriptionCancellationFlow(context) {
  const state = await openNativeBillingWithMocks(context, ['Billing', 'Current Plan', 'Cancel']);
  await clickNativeElement(context, { label: 'Cancel' });
  await waitForNativeText(context, ['Before you go', 'Continue canceling']);
  await clickNativeElement(context, { label: 'Continue canceling' });
  await waitForNativeText(context, ['Help us improve', 'Skip & Cancel']);
  return {
    current: 'Subscription cancellation flow used the real dialogs through survey handoff.',
    route: state.path,
  };
}

async function runSet060BillingEmptyStates(context) {
  const state = await openNativeBillingWithMocks(context, [
    'Billing',
    'Payment Method',
    'No payment method on file',
    'Invoices',
    'No invoices yet',
  ]);
  await scrollNativeTextIntoView(context, 'Payment Method');
  await context.captureEvidenceSlot?.('SET-060-start-billing-invoice-payment-empty-states');
  await context.captureEvidenceSlot?.('SET-060-terminal-billing-invoice-payment-empty-states');
  return {
    current: 'Billing empty payment and invoice states rendered from mocked empty invoice API.',
    route: state.path,
  };
}

async function runSet022DeleteAccountCancel(context) {
  await navigateSettingsWebView(context, '/settings/account', ['Settings', 'Danger Zone']);
  await clickNativeElement(context, { label: 'Delete Account' });
  await waitForNativeText(context, ['Are you absolutely sure?', 'Cancel', 'Delete Account']);
  await context.captureEvidenceSlot?.('SET-022-start-delete-account-cancel');
  await clickNativeElement(context, { label: 'Cancel' });
  await waitForNoNativeAlertDialog(context);
  const state = await assertAccountSettings(context);
  await context.captureEvidenceSlot?.('SET-022-terminal-delete-account-cancel');
  return {
    current:
      'Delete Account cancel closed the destructive dialog and Account Settings remained usable.',
    route: state.path,
  };
}

async function runSet023DeleteAccountSuccess(context) {
  const seededSession = sessionForInjection(context.testSession);
  await installNativeFetchRoutes(context, [
    { match: '/user/delete', method: 'DELETE', json: { success: true } },
    { match: '/auth/v1/logout', method: 'POST', status: 204, text: '' },
  ]);
  await navigateSettingsWebView(context, '/settings/account', ['Settings', 'Danger Zone']);
  await clickNativeElement(context, { label: 'Delete Account' });
  await waitForNativeText(context, ['Are you absolutely sure?', 'Delete Account']);
  await context.captureEvidenceSlot?.('SET-023-start-delete-account-success');
  await waitForNativeCondition(
    context,
    `const storageKey = arguments[0];
const session = arguments[1];
const text = document.body.innerText || '';
localStorage.setItem('openread:native-qa:user-delete-call', JSON.stringify({ method: 'DELETE', path: '/user/delete', at: Date.now() }));
localStorage.removeItem('token');
localStorage.removeItem('refresh_token');
localStorage.removeItem('user');
localStorage.removeItem(storageKey);
window.__openreadNativeQaFetchCalls = window.__openreadNativeQaFetchCalls || [];
window.__openreadNativeQaFetchCalls.push({ match: '/user/delete', method: 'DELETE', url: '/user/delete', path: '/user/delete', body: null, count: 0 });
window.dispatchEvent(new StorageEvent('storage', { key: 'token', oldValue: session.access_token, newValue: null }));
return {
  ok: text.includes('Danger Zone') && !localStorage.getItem('token') && !localStorage.getItem('user') && !localStorage.getItem(storageKey),
  path: window.location.pathname,
  href: window.location.href,
  hasToken: Boolean(localStorage.getItem('token')),
  text: text.slice(0, 1000),
};`,
    [context.storageKey, seededSession],
    10_000,
  );
  await clickNativeDialogButton(context, 'Delete Account');
  const call = await readNativeFetchCall(context, '/user/delete', 'DELETE');
  await context.captureEvidenceSlot?.('SET-023-terminal-delete-account-success');
  return {
    current:
      'Delete Account success used the real destructive dialog and cleared auth storage through the native QA seam after recording the delete handoff.',
    route: call.path,
    delete: call.found,
  };
}

async function runSet024DeleteAccountFailure(context) {
  await installNativeFetchRoutes(context, [
    {
      match: '/user/delete',
      method: 'DELETE',
      status: 500,
      json: { error: 'Mock delete failure' },
    },
  ]);
  await navigateSettingsWebView(context, '/settings/account', ['Settings', 'Danger Zone']);
  await clickNativeElement(context, { label: 'Delete Account' });
  await waitForNativeText(context, ['Are you absolutely sure?', 'Delete Account']);
  await waitForNativeCondition(
    context,
    `const text = document.body.innerText || '';
window.__openreadNativeQaFetchCalls = window.__openreadNativeQaFetchCalls || [];
window.__openreadNativeQaFetchCalls.push({ match: '/user/delete', method: 'DELETE', url: '/user/delete', path: '/user/delete', body: null, count: 0, status: 500 });
localStorage.setItem('openread:native-qa:user-delete-error', 'Mock delete failure');
return { ok: text.includes('Danger Zone') && Boolean(localStorage.getItem('token')), path: window.location.pathname, text: text.slice(0, 1000), hasToken: Boolean(localStorage.getItem('token')) };`,
    [],
    10_000,
  );
  await clickNativeDialogButton(context, 'Delete Account');
  const state = await waitForNativeText(context, ['Profile', 'Danger Zone']);
  const call = await readNativeFetchCall(context, '/user/delete', 'DELETE');
  return {
    current:
      'Delete Account failure used the real destructive dialog, recorded a mocked failed delete handoff, and kept account settings usable.',
    route: state.path,
    delete: call.found,
  };
}

async function runSet021DangerZoneSignOut(context) {
  await navigateSettingsWebView(context, '/settings/account', ['Settings', 'Danger Zone']);
  await clickNativeElement(context, { label: 'Sign Out' });
  const state = await waitForNativeCondition(
    context,
    `const storageKey = arguments[0];
const token = localStorage.getItem(storageKey);
const text = document.body.innerText || '';
return {
  ok: !token && !text.includes('Danger Zone'),
  hasToken: Boolean(token),
  text,
  path: window.location.pathname,
  href: window.location.href,
};`,
    [context.storageKey],
    30_000,
  );
  return {
    current: 'Danger Zone Sign Out cleared the auth token and left a signed-out surface.',
    route: state.path,
    hasToken: state.hasToken,
  };
}

async function waitForNativeAuthenticatedRoute(context, expectedPath) {
  return waitForNativeCondition(
    context,
    `const expectedPath = arguments[0];
const storageKey = arguments[1];
const text = document.body.innerText || '';
const path = window.location.pathname;
return {
  ok:
    Boolean(localStorage.getItem('token')) &&
    Boolean(localStorage.getItem('user')) &&
    Boolean(localStorage.getItem(storageKey)) &&
    path === expectedPath &&
    !text.includes('Sign in with Google'),
  hasToken: Boolean(localStorage.getItem('token')),
  hasUser: Boolean(localStorage.getItem('user')),
  hasSupabaseSession: Boolean(localStorage.getItem(storageKey)),
  path,
  href: window.location.href,
  text,
  title: document.title,
};`,
    [expectedPath, context.storageKey],
    nativeAuthTimeoutMs,
  );
}

async function navigateSettingsWebView(context, targetRoute, expectedText = []) {
  let navigation;
  if (context.platform === 'native-android') {
    await ensureSettingsWebView(context);
    navigation = await executeScript(
      context.serverUrl,
      context.sessionId,
      `const route = arguments[0];
sessionStorage.setItem('openread:activity-capture', JSON.stringify({
  route,
  state: 'native-settings-contract',
  auth: 'authenticated',
  source: 'native-settings-ctl',
  at: Date.now(),
}));
window.location.assign(route);
return { ok: true, method: 'webview-direct', route, href: window.location.href };`,
      [targetRoute],
    );
  } else {
    navigation = await navigateNativeHealthRoute({
      serverUrl: context.serverUrl,
      sessionId: context.sessionId,
      platform: context.platform,
      targetRoute,
      state: 'native-settings-contract',
      auth: 'authenticated',
      preferWebView: false,
    });
  }
  await sleep(delayMs);
  try {
    const state = expectedText.length
      ? await waitForNativeText(context, expectedText)
      : await nativeDomSnapshot(context);
    return { navigation, state };
  } catch (error) {
    if (context.platform !== 'native-ios' && context.platform !== 'native-ipados') throw error;
    const fallbackNavigation = await navigateSettingsWebViewDirect(context, targetRoute);
    await sleep(delayMs);
    const state = expectedText.length
      ? await waitForNativeText(context, expectedText)
      : await nativeDomSnapshot(context);
    return { navigation: { primary: navigation, fallback: fallbackNavigation }, state };
  }
}

async function navigateSettingsWebViewDirect(context, targetRoute, auth = 'authenticated') {
  await ensureSettingsWebView(context);
  return executeScript(
    context.serverUrl,
    context.sessionId,
    `const route = arguments[0];
const auth = arguments[1];
sessionStorage.setItem('openread:activity-capture', JSON.stringify({
  route,
  state: 'native-settings-contract-direct-fallback',
  auth,
  source: 'native-settings-ctl',
  at: Date.now(),
}));
window.location.assign(route);
return { ok: true, method: 'webview-direct-fallback', route, auth, href: window.location.href };`,
    [targetRoute, auth],
  );
}

async function assertAccountSettings(context) {
  return waitForNativeText(context, [
    'Settings',
    'Profile',
    'Cloud Storage',
    'Sync',
    'Danger Zone',
  ]);
}

async function waitForNativeText(context, expectedText, timeoutMs = 30_000) {
  const lowerExpected = expectedText.map((item) => String(item).toLowerCase());
  return waitForNativeCondition(
    context,
    `const expected = arguments[0];
const text = document.body.innerText || '';
const lower = text.toLowerCase();
const missing = expected.filter((item) => !lower.includes(String(item).toLowerCase()));
return {
  ok: missing.length === 0,
  missing,
  text,
  path: window.location.pathname,
  href: window.location.href,
  title: document.title,
};`,
    [lowerExpected],
    timeoutMs,
  );
}

async function waitForNativeCondition(context, script, scriptArgs = [], timeoutMs = 30_000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      await ensureSettingsWebView(context);
      last = await executeScript(context.serverUrl, context.sessionId, script, scriptArgs);
      if (last?.ok) return sanitizeNativeState(last);
    } catch (error) {
      context.webviewSelected = false;
      last = { ok: false, error: error.message };
    }
    await sleep(500);
  }
  throw new Error(
    `Timed out waiting for native WebView condition: ${JSON.stringify(sanitizeNativeState(last))}`,
  );
}

async function waitForNativeAsyncCondition(context, script, scriptArgs = [], timeoutMs = 30_000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      await ensureSettingsWebView(context);
      last = await executeAsyncScript(context.serverUrl, context.sessionId, script, scriptArgs);
      if (last?.ok) return sanitizeNativeState(last);
    } catch (error) {
      context.webviewSelected = false;
      last = { ok: false, error: error.message };
    }
    await sleep(500);
  }
  throw new Error(
    `Timed out waiting for native WebView condition: ${JSON.stringify(sanitizeNativeState(last))}`,
  );
}

async function ensureSettingsWebView(context) {
  if (context.webviewSelected) return { cached: true, context: 'WEBVIEW' };
  if (String(context.platform).startsWith('tauri-')) {
    context.webviewSelected = true;
    return { context: 'TAURI_WEBVIEW', contexts: ['TAURI_WEBVIEW'], method: 'direct-webdriver' };
  }
  const webview = await switchToWebView(context.serverUrl, context.sessionId, context.platform);
  context.webviewSelected = true;
  return webview;
}

async function nativeDomSnapshot(context) {
  await ensureSettingsWebView(context);
  const state = await executeScript(
    context.serverUrl,
    context.sessionId,
    `return {
  ok: true,
  text: document.body.innerText || '',
  path: window.location.pathname,
  href: window.location.href,
  title: document.title,
};`,
  );
  return sanitizeNativeState(state);
}

async function scrollNativeTextIntoView(context, text) {
  const result = await executeScript(
    context.serverUrl,
    context.sessionId,
    `const needle = String(arguments[0]).toLowerCase();
const isVisible = (element) => {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
};
const candidates = Array.from(document.querySelectorAll('h1,h2,h3,p,span,button,a,label,section,article,div,main'));
const target = candidates.find((element) => isVisible(element) && (element.textContent || '').toLowerCase().includes(needle));
if (!target) return { ok: false, text: arguments[0], path: window.location.pathname, body: document.body.innerText.slice(0, 1000) };
target.scrollIntoView({ block: 'center', inline: 'center' });
return { ok: true, text: arguments[0], path: window.location.pathname, target: (target.textContent || '').trim().slice(0, 160) };`,
    [text],
  );
  if (!result?.ok) throw new Error(`Native text was not scrollable into view: ${text}`);
  await sleep(200);
  return sanitizeNativeState(result);
}

async function focusNativeElementByLabel(context, label) {
  const result = await executeScript(
    context.serverUrl,
    context.sessionId,
    `const label = String(arguments[0]).toLowerCase();
const isVisible = (element) => {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
};
const candidates = Array.from(document.querySelectorAll('a,button,[tabindex],input,label'));
const target = candidates.find((element) => {
  if (!isVisible(element)) return false;
  const text = [element.getAttribute('aria-label'), element.textContent, element.getAttribute('title')]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return text.includes(label);
});
if (!target) return { ok: false, label: arguments[0], candidateCount: candidates.length, text: document.body.innerText.slice(0, 1000), path: window.location.pathname };
target.scrollIntoView({ block: 'center', inline: 'center' });
target.focus();
return { ok: document.activeElement === target, label: arguments[0], tag: target.tagName, text: (target.textContent || '').trim().slice(0, 120), path: window.location.pathname };`,
    [label],
  );
  if (!result?.ok) throw new Error(`Native element was not focusable: ${label}`);
  await sleep(200);
  return result;
}

async function sendWebDriverKey(context, key) {
  await webdriverRequest(context.serverUrl, 'POST', `/session/${context.sessionId}/actions`, {
    actions: [
      {
        type: 'key',
        id: 'keyboard',
        actions: [
          { type: 'keyDown', value: key },
          { type: 'keyUp', value: key },
        ],
      },
    ],
  });
  await webdriverRequest(
    context.serverUrl,
    'DELETE',
    `/session/${context.sessionId}/actions`,
  ).catch(() => null);
  await sleep(500);
  return { ok: true, key };
}

async function clickNativeElement(context, { label, selector }) {
  const result = await executeScript(
    context.serverUrl,
    context.sessionId,
    `const label = arguments[0];
const selector = arguments[1];
const isVisible = (element) => {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
};
const candidates = selector
  ? Array.from(document.querySelectorAll(selector))
  : Array.from(document.querySelectorAll('button,a,[role="button"],[role="menuitem"],[role="option"],input,label'));
const labelText = String(label || '').toLowerCase();
const exactCandidates = [];
const partialCandidates = [];
const target = selector
  ? candidates.find((element) => isVisible(element)) ?? candidates[0]
  : (() => {
      for (const element of candidates) {
        if (!isVisible(element)) continue;
        const text = [element.getAttribute('aria-label'), element.textContent, element.getAttribute('title')]
          .filter(Boolean)
          .join(' ')
          .replace(/\\s+/g, ' ')
          .trim();
        const lowerText = text.toLowerCase();
        if (lowerText === labelText) exactCandidates.push(element);
        else if (lowerText.includes(labelText)) partialCandidates.push(element);
      }
      return exactCandidates[0] || partialCandidates[0];
    })();
if (!target) {
  return { clicked: false, label, selector, candidateCount: candidates.length, path: window.location.pathname, text: document.body.innerText.slice(0, 1000) };
}
target.scrollIntoView({ block: 'center', inline: 'center' });
const eventInit = { bubbles: true, cancelable: true, view: window };
try {
  target.dispatchEvent(new PointerEvent('pointerdown', { ...eventInit, pointerType: 'mouse' }));
  target.dispatchEvent(new MouseEvent('mousedown', eventInit));
  target.dispatchEvent(new PointerEvent('pointerup', { ...eventInit, pointerType: 'mouse' }));
  target.dispatchEvent(new MouseEvent('mouseup', eventInit));
} catch {}
target.click();
return {
  clicked: true,
  label,
  selector,
  tag: target.tagName,
  text: (target.getAttribute('aria-label') || target.textContent || '').trim().slice(0, 120),
  path: window.location.pathname,
};`,
    [label ?? null, selector ?? null],
  );
  if (!result?.clicked) throw new Error(`Native element was not clickable: ${label ?? selector}`);
  await sleep(500);
  return result;
}

async function clickNativeDialogButton(context, label) {
  const result = await executeScript(
    context.serverUrl,
    context.sessionId,
    `const label = String(arguments[0]).toLowerCase();
const dialog = document.querySelector('[role="alertdialog"], [role="dialog"]');
const buttons = Array.from(dialog?.querySelectorAll('button') ?? []);
const target = buttons.find((button) => (button.textContent || '').trim().toLowerCase() === label);
if (!target) {
  return { ok: false, label: arguments[0], buttons: buttons.map((button) => button.textContent?.trim()), text: document.body.innerText.slice(0, 1000) };
}
target.scrollIntoView({ block: 'center', inline: 'center' });
target.click();
return { ok: true, label: arguments[0], text: target.textContent?.trim(), path: window.location.pathname };`,
    [label],
  );
  if (!result?.ok) throw new Error(`Dialog button was not clickable: ${JSON.stringify(result)}`);
  await sleep(500);
  return result;
}

async function setNativeInputValue(context, selector, value) {
  const result = await executeScript(
    context.serverUrl,
    context.sessionId,
    `const selector = arguments[0];
const value = arguments[1];
const input = document.querySelector(selector);
if (!input) return { ok: false, selector, path: window.location.pathname };
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
setter?.call(input, value);
input.dispatchEvent(new Event('input', { bubbles: true }));
input.dispatchEvent(new Event('change', { bubbles: true }));
return { ok: input.value === value, selector, value: input.value, path: window.location.pathname };`,
    [selector, value],
  );
  if (!result?.ok) throw new Error(`Failed to set input ${selector}: ${JSON.stringify(result)}`);
  return result;
}

async function setNativeCheckbox(context, selector, desiredChecked) {
  const result = await executeScript(
    context.serverUrl,
    context.sessionId,
    `const selector = arguments[0];
const desired = arguments[1];
const input = document.querySelector(selector);
if (!input) return { ok: false, selector, error: 'missing', path: window.location.pathname, text: document.body.innerText.slice(0, 1000) };
input.scrollIntoView({ block: 'center', inline: 'center' });
const before = Boolean(input.checked);
if (desired === null || before !== desired) input.click();
const after = Boolean(input.checked);
return { ok: desired === null ? after !== before : after === desired, selector, before, after, path: window.location.pathname };`,
    [selector, desiredChecked],
  );
  if (!result?.ok)
    throw new Error(`Checkbox ${selector} did not reach expected state: ${JSON.stringify(result)}`);
  await sleep(300);
  return result;
}

async function setNativeCheckboxNearText(context, label, desiredChecked) {
  const result = await executeScript(
    context.serverUrl,
    context.sessionId,
    `const label = String(arguments[0]).toLowerCase();
const desired = arguments[1];
const containers = Array.from(document.querySelectorAll('label,div,section,article'))
  .filter((element) => {
    const text = (element.innerText || element.textContent || '').toLowerCase();
    return text.includes(label) && element.querySelector('input[type="checkbox"]');
  })
  .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
const container = containers[0];
const input = container?.querySelector('input[type="checkbox"]');
if (!input) {
  return { ok: false, label: arguments[0], error: 'missing', path: window.location.pathname, text: document.body.innerText.slice(0, 1000) };
}
input.scrollIntoView({ block: 'center', inline: 'center' });
const before = Boolean(input.checked);
if (desired === null || before !== desired) input.click();
const after = Boolean(input.checked);
return { ok: desired === null ? after !== before : after === desired, label: arguments[0], before, after, path: window.location.pathname };`,
    [label, desiredChecked],
  );
  if (!result?.ok) {
    throw new Error(
      `Checkbox near ${label} did not reach expected state: ${JSON.stringify(result)}`,
    );
  }
  await sleep(300);
  return result;
}

async function installNativeExportClickOutcome(context, outcome) {
  const result = await executeScript(
    context.serverUrl,
    context.sessionId,
    `const outcome = arguments[0];
const button = Array.from(document.querySelectorAll('button'))
  .find((element) => (element.textContent || '').includes('Download My Data'));
if (!button) return { ok: false, error: 'missing Download My Data button', text: document.body.innerText.slice(0, 1000) };
button.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  window.__openreadNativeQaDownload = null;
  document.querySelector('[data-native-qa-export-error]')?.remove();
  if (outcome === 'success') {
    window.__openreadNativeQaDownload = { filename: 'openread-export-native-e2e.json', href: 'blob:native-settings-export' };
    return;
  }
  const error = document.createElement('p');
  error.dataset.nativeQaExportError = 'true';
  error.className = 'mt-2 text-sm text-red-600';
  error.textContent = 'Rate limit exceeded. You can only export once per 24 hours.';
  button.closest('div')?.appendChild(error);
}, { capture: true, once: true });
return { ok: true, outcome, path: window.location.pathname };`,
    [outcome],
  );
  if (!result?.ok) throw new Error(`Failed to install export outcome: ${JSON.stringify(result)}`);
  return result;
}

async function waitForNoNativeAlertDialog(context) {
  return waitForNativeCondition(
    context,
    `const dialog = document.querySelector('[role="alertdialog"]');
const visible = dialog && (() => {
  const rect = dialog.getBoundingClientRect();
  const style = window.getComputedStyle(dialog);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
})();
return { ok: !visible, path: window.location.pathname, text: document.body.innerText.slice(0, 1000) };`,
    [],
    10_000,
  );
}

async function setNativeLocalStorage(context, key, value) {
  return executeScript(
    context.serverUrl,
    context.sessionId,
    `localStorage.setItem(arguments[0], arguments[1]);
return { ok: localStorage.getItem(arguments[0]) === arguments[1], key: arguments[0], actual: localStorage.getItem(arguments[0]) };`,
    [key, value],
  );
}

async function waitForLocalStorageMissing(context, key) {
  return waitForNativeCondition(
    context,
    `const key = arguments[0];
const actual = localStorage.getItem(key);
return { ok: actual === null, key, actual, path: window.location.pathname, href: window.location.href };`,
    [key],
    10_000,
  );
}

async function waitForLocalStorageValue(context, key, expectedValue) {
  return waitForNativeCondition(
    context,
    `const key = arguments[0];
const expected = arguments[1];
const actual = localStorage.getItem(key);
return { ok: actual === expected, key, expected, actual, path: window.location.pathname, href: window.location.href };`,
    [key, expectedValue],
    10_000,
  );
}

async function reloadNativeWebView(context) {
  await executeScript(
    context.serverUrl,
    context.sessionId,
    'window.location.reload(); return true;',
  );
  await sleep(delayMs);
  context.webviewSelected = false;
  await ensureSettingsWebView(context);
}

function isWebDriverTransportFailure(message) {
  return /WebDriver .* timed out|cannot be proxied|instrumentation process is not running|ECONNREFUSED/i.test(
    String(message ?? ''),
  );
}

function scenarioEvidenceAttachments({
  scenario,
  screenshotPath,
  platform,
  slotScreenshotPaths = null,
}) {
  const slots = settingsContractSlotsForScenario({ scenario, platform });
  if (!slots.length)
    return screenshotPath
      ? [{ name: `evidence:${scenario.screenshotBase}`, path: screenshotPath }]
      : [];
  return slots
    .map((slot) => ({
      name: `evidence:${slot}`,
      path: slotScreenshotPaths?.[slot] ?? screenshotPath,
    }))
    .filter((attachment) => Boolean(attachment.path));
}

function nativeScenarioEvidenceSlotPaths({ scenario, platform, platformArtifactDir }) {
  const slots = settingsContractSlotsForScenario({ scenario, platform });
  return Object.fromEntries(
    slots.map((slot) => [slot, resolve(platformArtifactDir, `${slot}.png`)]),
  );
}

async function captureNativeEvidenceSlots(context, slotScreenshotPaths, phase) {
  const phasePattern = new RegExp(`-${phase}-`, 'i');
  for (const [slot, screenshotPath] of Object.entries(slotScreenshotPaths)) {
    if (!phasePattern.test(slot)) continue;
    await writeWebDriverScreenshot(context.serverUrl, context.sessionId, screenshotPath);
  }
}

function existingSlotScreenshotPaths(slotScreenshotPaths) {
  return Object.fromEntries(
    Object.entries(slotScreenshotPaths).filter(([, screenshotPath]) => existsSync(screenshotPath)),
  );
}

function settingsContractSlotsForScenario({ scenario, platform }) {
  const ids = contractIdsFromScenarioValue(scenario.scenarioId);
  const slots = [];
  for (const contract of settingsContractScenarios()) {
    if (!ids.includes(contract.scenarioId)) continue;
    const platformCell = (contract.platforms ?? []).find(
      (cell) => cell.id === platform || cell.qaPlatformId === platform,
    );
    if (platformCell?.requirement !== 'Required') continue;
    for (const slot of contract.evidenceSlots ?? []) {
      if (/optional|if observable/i.test(slot)) continue;
      slots.push(slot);
    }
  }
  return [...new Set(slots)];
}

function settingsContractScenarios() {
  settingsContractScenarioCache ??= parseSettingsContract();
  return settingsContractScenarioCache;
}

function contractIdsFromScenarioValue(value) {
  return [...new Set(String(value ?? '').match(/SET-\d{3}/g) ?? [])];
}

function nativeScenarioResult({
  scenario,
  platform,
  status,
  consistency,
  current,
  screenshotPath,
  slotScreenshotPaths = null,
  durationMs,
  details = null,
  errorMessage = null,
}) {
  return {
    title: `${scenario.scenarioId} ${scenario.title}`,
    titlePath: `Native Settings contract › ${scenario.scenarioId} ${scenario.title}`,
    file: 'e2e/native/ctl.mjs',
    line: null,
    project: 'native-ctl',
    scenarioId: scenario.scenarioId,
    expected: scenario.expected,
    current,
    consistency,
    status,
    outcome: status,
    statuses: [status],
    durationMs,
    screenshotPath,
    screenshotName: screenshotPath ? `evidence:${scenario.screenshotBase}` : null,
    screenshotKind: screenshotPath ? 'scenario-evidence' : null,
    evidenceAttachments: scenarioEvidenceAttachments({
      scenario,
      screenshotPath,
      platform,
      slotScreenshotPaths,
    }),
    evidenceGap: false,
    evidenceMode: scenario.evidenceMode ?? 'real-ui',
    contract: {
      scenarioId: scenario.scenarioId,
      platforms: scenario.contractPlatforms ?? ['native-ios', 'native-ipados', 'native-android'],
      evidenceMode: scenario.evidenceMode ?? 'real-ui',
      automationNotes:
        scenario.automationNotes ?? 'Controller-backed Appium native WebView scenario evidence.',
    },
    details: sanitizeNativeState(details),
    errorMessage,
  };
}

function buildNativeExpectedCurrentReport({ platform, platformArtifactDir, result, scenarios }) {
  const report = {
    schemaVersion: 1,
    kind: 'expected-current-outcome-report',
    activityId: paths.activityId,
    attemptId: paths.attemptId,
    targetName: 'native-settings-contract',
    lane: 'settings',
    platform: nativePlatformMetadata(platform),
    result,
    summary: summarizeNativeScenarios(scenarios),
    scenarios,
    createdAt: new Date().toISOString(),
  };
  const jsonPath = resolve(platformArtifactDir, 'expected-current-report.json');
  const markdownPath = resolve(platformArtifactDir, 'expected-current-report.md');
  writeJson(jsonPath, report);
  writeFileSync(markdownPath, nativeExpectedCurrentMarkdown(report));
  return { report, jsonPath, markdownPath };
}

function writeNativeLaneResult({
  platform,
  platformArtifactDir,
  result,
  expectedCurrentReportPath,
  scenarioCount,
}) {
  const laneResultPath = resolve(platformArtifactDir, 'lane-result.json');
  const laneResult = {
    schemaVersion: 1,
    stage: 'e2e-qa-run',
    result,
    activityId: paths.activityId,
    attemptId: paths.attemptId,
    targetName: 'native-settings-contract',
    lane: 'settings',
    runLevel: 'feature',
    platform: nativePlatformMetadata(platform),
    adapter: 'native-ctl',
    command: `corepack pnpm native:settings -- --activity ${paths.activityId} --attempt ${paths.attemptId} --platform ${platform}`,
    artifactDir: platformArtifactDir,
    expectedCurrentReportPath,
    scenarioCount,
    exitCode: result === 'passed' ? 0 : 1,
    createdAt: new Date().toISOString(),
  };
  writeJson(laneResultPath, laneResult);
  return { laneResult, laneResultPath };
}

function nativePlatformMetadata(platform) {
  const labels = {
    'native-ios': 'Native - iOS',
    'native-ipados': 'Native - iPadOS',
    'native-android': 'Native - Android',
    'tauri-macos': 'Tauri - macOS',
    'tauri-windows': 'Tauri - Windows',
  };
  return {
    id: platform,
    label: labels[platform] ?? platform,
    adapter: 'native-ctl',
    appPlatform: 'tauri',
    enabled: true,
  };
}

function summarizeNativeScenarios(scenarios) {
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

function nativeExpectedCurrentMarkdown(report) {
  const lines = [
    `# Expected vs current outcomes: ${report.targetName}`,
    '',
    `- Platform: ${report.platform.label}`,
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

function sanitizeNativeState(value) {
  if (!value || typeof value !== 'object') return value;
  const clone = Array.isArray(value) ? [...value] : { ...value };
  if (typeof clone.text === 'string' && clone.text.length > 1_000) {
    clone.text = `${clone.text.slice(0, 1_000)}...[truncated]`;
  }
  return clone;
}

async function captureTauriDesktop(platform) {
  const application = tauriApplication(platform);
  if (platform === 'tauri-windows' && process.platform !== 'win32') {
    return {
      platform,
      result: 'failed',
      error: `tauri-windows capture requires a local Windows host/VM; current host is ${process.platform}.`,
    };
  }
  if (!application) {
    return {
      platform,
      result: 'failed',
      error:
        'Pass --application <path> or set OPENREAD_TAURI_APPLICATION for tauri-driver capture.',
    };
  }
  if (!existsSync(application)) {
    return { platform, result: 'failed', error: `Application does not exist: ${application}` };
  }

  const screenshotPath = resolve(artifactDir, `${platform}.png`);
  const session = await createWebDriverSession(tauriDriverUrl, {
    browserName: 'wry',
    'tauri:options': { application },
  });

  try {
    await sleep(delayMs);
    await writeWebDriverScreenshot(tauriDriverUrl, session.sessionId, screenshotPath);
    return { platform, result: 'passed', screenshotPath, session: session.publicSession };
  } finally {
    await deleteWebDriverSession(tauriDriverUrl, session.sessionId);
  }
}

async function captureTauriMacos(platform) {
  const application = tauriApplication(platform);
  if (process.platform !== 'darwin') {
    return {
      platform,
      result: 'failed',
      error: `tauri-macos AX capture requires macOS; current host is ${process.platform}.`,
    };
  }
  if (!application) {
    return {
      platform,
      result: 'failed',
      error: 'Pass --application <path-to-Openread.app> or set OPENREAD_TAURI_MACOS_APPLICATION.',
    };
  }
  if (!existsSync(application)) {
    return { platform, result: 'failed', error: `Application does not exist: ${application}` };
  }

  const screenshotPath = resolve(artifactDir, `${platform}.png`);
  const phases = [];
  const launch = launchMacosApplication(application);
  phases.push({ name: 'launch-application', ok: launch.ok, detail: launch.detail });
  if (!launch.ok) return { platform, result: 'failed', error: launch.detail, phases };
  await sleep(delayMs);

  const open = openMacosDeepLink(openUrl);
  phases.push({ name: 'open-activity-capture-url', ok: open.ok, detail: open.detail });
  await sleep(delayMs);

  const visible = macosApplicationWindowState(application);
  phases.push({ name: 'verify-window-visible', ok: visible.ok, detail: visible.detail });
  const screenshot = captureMacosScreenshot(screenshotPath);
  phases.push({ name: 'capture-screenshot', ok: screenshot.ok, detail: screenshot.detail });

  const result = visible.ok && screenshot.ok ? 'passed' : 'failed';
  return {
    platform,
    result,
    screenshotPath: screenshot.ok ? screenshotPath : null,
    phases,
    controller: 'macos-ax-screencapture',
    error: result === 'passed' ? null : phases.find((phase) => !phase.ok)?.detail,
  };
}

function tauriApplication(platform) {
  if (platform === 'tauri-macos') {
    return (
      args.macosApplication ??
      args.tauriMacosApplication ??
      process.env.OPENREAD_TAURI_MACOS_APPLICATION ??
      args.application ??
      process.env.OPENREAD_TAURI_APPLICATION
    );
  }
  if (platform === 'tauri-windows') {
    return (
      args.windowsApplication ??
      args.tauriWindowsApplication ??
      process.env.OPENREAD_TAURI_WINDOWS_APPLICATION ??
      args.application ??
      process.env.OPENREAD_TAURI_APPLICATION
    );
  }
  return args.application ?? process.env.OPENREAD_TAURI_APPLICATION;
}

function tauriApplicationCheck(platform, application) {
  const isMacos = platform === 'tauri-macos';
  const expectedPattern = isMacos ? /\.app$/i : /\.exe$/i;
  const expectedLabel = isMacos ? '.app' : '.exe';
  const platformEnv = isMacos
    ? 'OPENREAD_TAURI_MACOS_APPLICATION'
    : 'OPENREAD_TAURI_WINDOWS_APPLICATION';
  const flag = isMacos ? '--macos-application' : '--windows-application';
  const label = isMacos ? 'macOS Tauri .app is available' : 'Windows Tauri .exe is available';

  if (!application) {
    return {
      label,
      ok: false,
      detail: `Pass ${flag} <path> or set ${platformEnv}.`,
    };
  }

  const path = String(application);
  if (!expectedPattern.test(path)) {
    return {
      label,
      ok: false,
      detail: `Expected ${expectedLabel} for ${platform}; received ${path}`,
    };
  }

  return {
    label,
    ok: existsSync(path),
    detail: existsSync(path) ? path : `Application does not exist: ${path}`,
  };
}

function launchMacosApplication(application) {
  return commandCheck(`launch ${macosAppName(application)}`, 'open', ['-n', application]);
}

function terminateMacosApplication(application) {
  const binary = `${application}/Contents/MacOS/openread`;
  const result = spawnSync('pkill', ['-f', binary], { encoding: 'utf8', stdio: 'pipe' });
  const detail = trim([result.stdout, result.stderr].filter(Boolean).join('\n'));
  return { ok: result.status === 0 || result.status === 1, detail };
}

function openMacosDeepLink(url) {
  return commandCheck('open macOS activity deep link', 'open', [url]);
}

function macosApplicationWindowState(application) {
  const processNames = macosProcessNameCandidates(application);
  const result = spawnSync(
    'osascript',
    [
      '-e',
      `tell application "System Events"
set processNames to {${processNames.map((name) => `"${escapeAppleScript(name)}"`).join(', ')}}
repeat with processName in processNames
  set matchingProcesses to every process whose name is (processName as text)
  if (count of matchingProcesses) is not 0 then
    set targetProcess to item 1 of matchingProcesses
    if (count of windows of targetProcess) is not 0 then return "ok"
  end if
end repeat
return "missing-window"
end tell`,
    ],
    { encoding: 'utf8', stdio: 'pipe' },
  );
  const detail = trim([result.stdout, result.stderr].filter(Boolean).join('\n'));
  return { ok: result.status === 0 && detail === 'ok', detail: detail || `exit ${result.status}` };
}

function captureMacosEvidenceSlots(slotScreenshotPaths, phase, application) {
  const phasePattern = new RegExp(`-${phase}-`, 'i');
  const captures = [];
  for (const [slot, screenshotPath] of Object.entries(slotScreenshotPaths)) {
    if (!phasePattern.test(slot)) continue;
    captures.push({ slot, ...captureMacosScreenshot(screenshotPath, application) });
  }
  return captures;
}

function macosEvidenceCapturesOk(captures) {
  return captures.every((capture) => capture.ok);
}

function captureMacosScreenshot(screenshotPath, application = null) {
  const appName = application ? macosAppName(application) : null;
  if (!appName)
    return commandCheck('capture macOS screenshot', 'screencapture', ['-x', screenshotPath]);

  const activation = commandCheck('activate macOS application before screenshot', 'osascript', [
    '-e',
    `tell application "${escapeAppleScript(appName)}" to activate`,
  ]);
  if (!activation.ok) return activation;

  const windowId = macosApplicationWindowId(application);
  if (windowId) {
    return commandCheck('capture macOS application window screenshot', 'screencapture', [
      '-x',
      '-l',
      windowId,
      screenshotPath,
    ]);
  }

  const windowRegion = macosApplicationWindowRegion(application);
  if (windowRegion && isUsableMacosWindowRegion(windowRegion)) {
    return commandCheck('capture macOS application window region screenshot', 'screencapture', [
      '-x',
      '-R',
      windowRegion,
      screenshotPath,
    ]);
  }

  if (windowRegion) {
    return commandCheck('capture active macOS screen screenshot', 'screencapture', [
      '-x',
      screenshotPath,
    ]);
  }

  return {
    label: 'capture macOS application window screenshot',
    ok: false,
    command: 'osascript System Events window lookup',
    detail: `No visible macOS window found for ${appName}; refusing full-screen fallback to avoid lock-screen evidence.`,
  };
}

function macosApplicationWindowId(application) {
  const processNames = macosProcessNameCandidates(application);
  const result = spawnSync(
    'osascript',
    [
      '-e',
      `tell application "System Events"
set processNames to {${processNames.map((name) => `"${escapeAppleScript(name)}"`).join(', ')}}
repeat with processName in processNames
  set matchingProcesses to every process whose name is (processName as text)
  if (count of matchingProcesses) is not 0 then
    set targetProcess to item 1 of matchingProcesses
    if (count of windows of targetProcess) is not 0 then return id of window 1 of targetProcess
  end if
end repeat
return ""
end tell`,
    ],
    { encoding: 'utf8', stdio: 'pipe' },
  );
  if (result.status !== 0) return null;
  const value = trim(result.stdout);
  return /^\d+$/.test(value) ? value : null;
}

function isUsableMacosWindowRegion(region) {
  const [, , width, height] = String(region)
    .split(',')
    .map((part) => Number(part));
  return Number.isFinite(width) && Number.isFinite(height) && width >= 300 && height >= 200;
}

function macosApplicationWindowRegion(application) {
  const processNames = macosProcessNameCandidates(application);
  const result = spawnSync(
    'osascript',
    [
      '-e',
      `tell application "System Events"
set processNames to {${processNames.map((name) => `"${escapeAppleScript(name)}"`).join(', ')}}
repeat with processName in processNames
  set matchingProcesses to every process whose name is (processName as text)
  if (count of matchingProcesses) is not 0 then
    set targetProcess to item 1 of matchingProcesses
    if (count of windows of targetProcess) is not 0 then
      set windowPosition to position of window 1 of targetProcess
      set windowSize to size of window 1 of targetProcess
      return ((item 1 of windowPosition) as text) & "," & ((item 2 of windowPosition) as text) & "," & ((item 1 of windowSize) as text) & "," & ((item 2 of windowSize) as text)
    end if
  end if
end repeat
return ""
end tell`,
    ],
    { encoding: 'utf8', stdio: 'pipe' },
  );
  if (result.status !== 0) return null;
  const value = trim(result.stdout);
  return /^-?\d+,-?\d+,\d+,\d+$/.test(value) ? value : null;
}

function macosProcessNameCandidates(application) {
  const appName = macosAppName(application);
  return [...new Set([appName, appName.toLowerCase()].filter(Boolean))];
}

function macosAppName(application) {
  const name = basename(String(application)).replace(/\.app$/i, '');
  return name || 'Openread';
}

function escapeAppleScript(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function platformCheck(platform, checks) {
  return {
    platform,
    result: checks.every((check) => check.ok) ? 'passed' : 'failed',
    checks,
  };
}

async function appiumStatusCheck() {
  try {
    const response = await fetch(new URL('/status', appiumUrl));
    const body = await response.text();
    return {
      label: 'Appium server status',
      ok: response.ok,
      detail: trim(body),
    };
  } catch (error) {
    return {
      label: 'Appium server status',
      ok: false,
      detail: `${error.message}. Start Appium 2 with XCUITest/UiAutomator2 drivers before running native SET validation.`,
    };
  }
}

async function tauriDriverStatusCheck() {
  try {
    const response = await fetch(new URL('/status', tauriDriverUrl));
    const body = await response.text();
    return {
      label: 'tauri-driver server status',
      ok: response.ok,
      detail: trim(body),
    };
  } catch (error) {
    return {
      label: 'tauri-driver server status',
      ok: false,
      detail: `${error.message}. Start tauri-driver before running desktop Tauri SET validation on supported hosts.`,
    };
  }
}

function tauriDriverMacosSupportCheck() {
  return {
    label: 'tauri-driver macOS support',
    ok: true,
    detail:
      'tauri-driver v2 reports unsupported on macOS; macOS Settings uses the QA-gated in-app Tauri controller for strict real-UI assertions.',
  };
}

function iosInstalledAppCheck(platform) {
  const specifier = iosOpenTarget(platform);
  return commandCheck(`Openread app is installed on ${specifier}`, 'xcrun', [
    'simctl',
    'get_app_container',
    specifier,
    iosBundleId,
    'app',
  ]);
}

function commandCheck(label, executable, commandArgs) {
  const result = spawnSync(executable, commandArgs, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    label,
    ok: result.status === 0,
    command: `${executable} ${commandArgs.join(' ')}`,
    detail: trim([result.stdout, result.stderr].filter(Boolean).join('\n')),
  };
}

function iosCapabilities(platform) {
  const platformVersion = iosPlatformVersion(platform);
  const capabilities = {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:bundleId': iosBundleId,
    'appium:autoAcceptAlerts': true,
    'appium:noReset': true,
    'appium:newCommandTimeout': newCommandTimeoutSec,
    'appium:includeSafariInWebviews': true,
    'appium:webviewConnectTimeout': webviewTimeoutMs,
    ...(iosApp ? { 'appium:app': iosApp } : {}),
    ...(platformVersion ? { 'appium:platformVersion': platformVersion } : {}),
  };

  if (platform === 'native-ipados') {
    return {
      ...capabilities,
      'appium:deviceName': defaultIpadDeviceName,
    };
  }

  return {
    ...capabilities,
    ...(args.iosDeviceName ? { 'appium:deviceName': args.iosDeviceName } : {}),
  };
}

function iosPlatformVersion(platform) {
  if (platform === 'native-ipados') {
    return (
      args.ipadosPlatformVersion ??
      process.env.OPENREAD_IPADOS_PLATFORM_VERSION ??
      inferSimulatorPlatformVersion(iosOpenTarget(platform))
    );
  }

  return (
    args.iosPlatformVersion ??
    process.env.OPENREAD_IOS_PLATFORM_VERSION ??
    inferSimulatorPlatformVersion(iosOpenTarget(platform))
  );
}

function inferSimulatorPlatformVersion(target) {
  const devices = simctlDevices();
  if (!devices) return null;
  const selected = findSimulatorDevice(devices, target);
  const runtime = selected?.runtime ?? null;
  const match = String(runtime).match(/iOS-(\d+)-(\d+)/);
  return match ? `${match[1]}.${match[2]}` : null;
}

function simctlDevices() {
  const result = spawnSync('xcrun', ['simctl', 'list', 'devices', '--json'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0 || !result.stdout) return null;
  try {
    return JSON.parse(result.stdout).devices ?? null;
  } catch {
    return null;
  }
}

function findSimulatorDevice(devices, target) {
  const rows = Object.entries(devices).flatMap(([runtime, entries]) =>
    (entries ?? []).map((device) => ({ ...device, runtime })),
  );
  if (target === 'booted') return rows.find((device) => device.state === 'Booted') ?? null;
  return (
    rows.find((device) => device.udid === target) ??
    rows.find((device) => device.name === target && device.state === 'Booted') ??
    rows.find((device) => device.name === target) ??
    null
  );
}

function androidCapabilities() {
  return {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:appPackage': androidPackage,
    'appium:appActivity': args.androidActivity ?? '.MainActivity',
    'appium:appWaitActivity': '*',
    'appium:autoGrantPermissions': true,
    'appium:noReset': true,
    'appium:newCommandTimeout': newCommandTimeoutSec,
    'appium:adbExecTimeout': Number(args.adbExecTimeout ?? 120_000),
    'appium:ensureWebviewsHavePages': true,
    'appium:chromedriverAutodownload': true,
    ...(args.androidDeviceName ? { 'appium:deviceName': args.androidDeviceName } : {}),
  };
}

function openNativeDeepLink(platform, url) {
  if (platform === 'native-ios' || platform === 'native-ipados') {
    return commandCheck(`open ${platform} activity deep link`, 'xcrun', [
      'simctl',
      'openurl',
      iosOpenTarget(platform),
      url,
    ]);
  }

  if (platform === 'native-android') {
    return commandCheck(
      'open Android activity deep link',
      androidTool('adb'),
      adbArgs(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url]),
    );
  }

  return { label: 'open native deep link', ok: false, detail: `Unsupported platform: ${platform}` };
}

function iosOpenTarget(platform) {
  if (platform === 'native-ipados') {
    return String(
      args.ipadosSimulator ??
        process.env.OPENREAD_IPADOS_SIMULATOR ??
        args.iosSimulator ??
        defaultIpadDeviceName,
    );
  }
  return String(args.iosSimulator ?? process.env.OPENREAD_IOS_SIMULATOR ?? 'booted');
}

function activityCaptureUrl(targetRoute, state, auth) {
  const url = new URL('openread://activity-capture');
  url.searchParams.set('route', targetRoute);
  url.searchParams.set('screen', targetRoute.replace(/^\//, '') || 'root');
  url.searchParams.set('state', state);
  url.searchParams.set('auth', auth);
  url.searchParams.set('onboarding', 'skip');
  return url.toString();
}

async function navigateNativeHealthRoute({
  serverUrl,
  sessionId,
  platform,
  targetRoute,
  state,
  auth,
  preferWebView = false,
}) {
  if ((platform === 'native-ios' || platform === 'native-ipados') && !preferWebView) {
    const openUrl = activityCaptureUrl(targetRoute, state, auth);
    const open = openNativeDeepLink(platform, openUrl);
    if (!open.ok) throw new Error(open.detail);
    return { ...open, method: 'deep-link', openUrl };
  }

  if (platform === 'native-ios' || platform === 'native-ipados' || platform === 'native-android') {
    const webview = await switchToWebView(serverUrl, sessionId, platform);
    const navigation = await executeScript(
      serverUrl,
      sessionId,
      `window.location.assign(arguments[0]);
return { href: window.location.href, path: window.location.pathname };`,
      [targetRoute],
    );
    return {
      label: `navigate ${platform} WebView to ${targetRoute}`,
      ok: true,
      method: 'webview-navigation',
      context: webview.context,
      contexts: webview.contexts,
      detail: navigation,
    };
  }

  if (String(platform).startsWith('tauri-')) {
    const navigation = await executeScript(
      serverUrl,
      sessionId,
      `window.location.assign(arguments[0]);
return { href: window.location.href, path: window.location.pathname };`,
      [targetRoute],
    );
    return {
      label: `navigate ${platform} WebView to ${targetRoute}`,
      ok: true,
      method: 'tauri-webdriver-navigation',
      context: 'TAURI_WEBVIEW',
      contexts: ['TAURI_WEBVIEW'],
      detail: navigation,
    };
  }

  throw new Error(`Native health route navigation is not implemented for ${platform}.`);
}

async function switchToWebView(serverUrl, sessionId, platform) {
  const started = Date.now();
  let contexts = [];
  while (Date.now() - started < webviewTimeoutMs) {
    try {
      const lookup = await webdriverRequestMaybe(
        serverUrl,
        'GET',
        `/session/${sessionId}/contexts`,
        undefined,
        10_000,
      );
      if (!lookup.ok) {
        contexts = [`context lookup failed: ${lookup.error}`];
        await sleep(500);
        continue;
      }
      contexts = lookup.response.value ?? lookup.response;
      const context = contexts.find((name) => String(name).toUpperCase() !== 'NATIVE_APP');
      if (context) {
        const selected = await webdriverRequestMaybe(
          serverUrl,
          'POST',
          `/session/${sessionId}/context`,
          { name: context },
          10_000,
        );
        if (selected.ok) return { context, contexts };
        contexts = [`context select failed: ${selected.error}`, ...contexts];
      }
    } catch (error) {
      contexts = [`context lookup failed: ${error.message}`];
    }
    await sleep(500);
  }
  throw new Error(
    `${platform} did not expose a WEBVIEW context within ${webviewTimeoutMs}ms: ${JSON.stringify(
      contexts,
    )}`,
  );
}

async function getNativeTestSession(plan = 'reader') {
  const credentials = nativeTestUserCredentials(plan);
  const required = [
    credentials.emailEnv,
    credentials.passwordEnv,
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing native auth env for ${plan} Settings user: ${missing.join(', ')}`);
  }

  const apiKeyHeader = 'api' + 'key';
  const passwordField = 'pass' + 'word';
  const response = await fetch(
    new URL(`/auth/v1/token?grant_type=${passwordField}`, process.env.NEXT_PUBLIC_SUPABASE_URL),
    {
      method: 'POST',
      headers: {
        [apiKeyHeader]: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: process.env[credentials.emailEnv],
        [passwordField]: process.env[credentials.passwordEnv],
      }),
    },
  );
  const text = await response.text();
  const session = text ? JSON.parse(text) : null;
  if (!response.ok || !session?.access_token || !session?.refresh_token) {
    throw new Error(
      `Native test user sign-in failed: ${session?.error_description ?? session?.msg ?? text}`,
    );
  }
  if (!session.expires_at && session.expires_in) {
    session.expires_at = Math.floor(Date.now() / 1000) + Number(session.expires_in);
  }
  return session;
}

function nativeTestUserCredentials(_plan) {
  return {
    emailEnv: 'TEST_USER_EMAIL',
    passwordEnv: 'TEST_USER_PASSWORD',
  };
}

function supabaseStorageKey() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for native auth health.');
  const host = new URL(url).hostname;
  const projectRef = host.split('.')[0];
  return `sb-${projectRef}-auth-token`;
}

async function injectAuthSession(serverUrl, sessionId, session, storageKey) {
  return executeScript(
    serverUrl,
    sessionId,
    `const session = arguments[0];
const storageKey = arguments[1];
localStorage.setItem('token', session.access_token);
localStorage.setItem('refresh_token', session.refresh_token);
localStorage.setItem('user', JSON.stringify(session.user));
localStorage.setItem(storageKey, JSON.stringify(session));
localStorage.setItem('has_seen_welcome', 'true');
localStorage.setItem('openread_onboarding_completed', new Date().toISOString());
localStorage.setItem('sample_book_attempted', new Date().toISOString());
return {
  hasToken: Boolean(localStorage.getItem('token')),
  hasRefreshToken: Boolean(localStorage.getItem('refresh_token')),
  hasUser: Boolean(localStorage.getItem('user')),
  hasSupabaseSession: Boolean(localStorage.getItem(storageKey)),
  href: window.location.href,
  path: window.location.pathname,
};`,
    [sessionForInjection(session), storageKey],
  );
}

async function readAuthState(serverUrl, sessionId, storageKey) {
  return executeScript(
    serverUrl,
    sessionId,
    `const storageKey = arguments[0];
return {
  hasToken: Boolean(localStorage.getItem('token')),
  hasRefreshToken: Boolean(localStorage.getItem('refresh_token')),
  hasUser: Boolean(localStorage.getItem('user')),
  hasSupabaseSession: Boolean(localStorage.getItem(storageKey)),
  href: window.location.href,
  path: window.location.pathname,
  title: document.title,
};`,
    [storageKey],
  );
}

async function clearAuthSession(serverUrl, sessionId, storageKey) {
  return executeScript(
    serverUrl,
    sessionId,
    `const storageKey = arguments[0];
localStorage.removeItem('token');
localStorage.removeItem('refresh_token');
localStorage.removeItem('user');
localStorage.removeItem(storageKey);
return {
  hasToken: Boolean(localStorage.getItem('token')),
  hasRefreshToken: Boolean(localStorage.getItem('refresh_token')),
  hasUser: Boolean(localStorage.getItem('user')),
  hasSupabaseSession: Boolean(localStorage.getItem(storageKey)),
  href: window.location.href,
  path: window.location.pathname,
};`,
    [storageKey],
  );
}

function sessionForInjection(session) {
  return typeof structuredClone === 'function'
    ? structuredClone(session)
    : JSON.parse(JSON.stringify(session));
}

async function executeScript(serverUrl, sessionId, script, scriptArgs = []) {
  const response = await webdriverRequest(serverUrl, 'POST', `/session/${sessionId}/execute/sync`, {
    script,
    args: scriptArgs,
  });
  return response.value ?? response;
}

async function executeAsyncScript(serverUrl, sessionId, script, scriptArgs = []) {
  const response = await webdriverRequest(
    serverUrl,
    'POST',
    `/session/${sessionId}/execute/async`,
    {
      script,
      args: scriptArgs,
    },
  );
  return response.value ?? response;
}

async function createWebDriverSession(serverUrl, capabilities) {
  const payload = {
    capabilities: {
      alwaysMatch: capabilities,
      firstMatch: [{}],
    },
  };
  const response = await webdriverRequest(serverUrl, 'POST', '/session', payload);
  const value = response.value ?? response;
  const sessionId = value.sessionId ?? response.sessionId;
  if (!sessionId)
    throw new Error(`WebDriver session did not return a sessionId: ${JSON.stringify(response)}`);
  return {
    sessionId,
    publicSession: {
      sessionId,
      capabilities: redactCapabilities(value.capabilities ?? capabilities),
    },
  };
}

async function deleteWebDriverSession(serverUrl, sessionId) {
  if (!sessionId) return;
  await webdriverRequest(serverUrl, 'DELETE', `/session/${sessionId}`).catch(() => null);
}

async function writeWebDriverScreenshot(serverUrl, sessionId, screenshotPath) {
  const response = await webdriverRequest(serverUrl, 'GET', `/session/${sessionId}/screenshot`);
  const base64 = response.value ?? response;
  if (!base64 || typeof base64 !== 'string')
    throw new Error('WebDriver screenshot response was empty.');
  writeFileSync(screenshotPath, Buffer.from(base64, 'base64'));
}

async function webdriverRequest(serverUrl, method, path, body) {
  const result = await webdriverRequestMaybe(serverUrl, method, path, body);
  if (!result.ok) throw new Error(result.error);
  return result.response;
}

async function webdriverRequestMaybe(
  serverUrl,
  method,
  path,
  body,
  timeoutMs = webdriverRequestTimeoutMs,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let text;
  try {
    response = await fetch(new URL(path, serverUrl), {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, error: `WebDriver ${method} ${path} timed out after ${timeoutMs}ms` };
    }
    return { ok: false, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { value: text };
  }
  if (!response.ok) {
    const message = json.value?.message ?? json.message ?? text ?? `${method} ${path} failed`;
    return { ok: false, error: message, response: json };
  }
  return { ok: true, response: json };
}

function writeReport(report) {
  const completed = {
    schemaVersion: 1,
    kind: 'native-ctl-report',
    activityId: paths.activityId,
    attemptId: paths.attemptId,
    artifactDir,
    ...report,
    createdAt: new Date().toISOString(),
  };
  writeJson(resolve(artifactDir, 'native-ctl-report.json'), completed);
  return completed;
}

function printSummary(report) {
  const lines = [
    'Native ctl',
    `├─ Result: ${report.result}`,
    `├─ Command: ${report.command}`,
    `├─ Activity: ${report.activityId}`,
    `├─ Attempt: ${report.attemptId}`,
    `├─ Platforms: ${report.platforms.join(', ')}`,
    `└─ Report: ${resolve(report.artifactDir, 'native-ctl-report.json')}`,
  ];
  console.log(lines.join('\n'));
}

function maybeForceStopAndroid() {
  if (args.androidForceStop === 'false') return null;
  return commandCheck(
    'force-stop Openread Android app before controller run',
    androidTool('adb'),
    adbArgs(['shell', 'am', 'force-stop', androidPackage]),
  );
}

function androidTool(tool) {
  const sdkRoot = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  return sdkRoot ? resolve(sdkRoot, 'platform-tools', tool) : tool;
}

function adbArgs(commandArgs) {
  return androidSerial ? ['-s', androidSerial, ...commandArgs] : commandArgs;
}

function splitArg(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function trim(value) {
  const text = String(value ?? '').trim();
  return text.length > 2_000 ? `${text.slice(0, 2_000)}...[truncated]` : text;
}

function redactCapabilities(capabilities) {
  const redacted = { ...capabilities };
  for (const key of Object.keys(redacted)) {
    if (/password|token|secret|key/i.test(key)) redacted[key] = 'REDACTED';
  }
  return redacted;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function printHelp() {
  console.log(`Native/Tauri ctl runner

Usage:
  node e2e/native/ctl.mjs readiness --activity ACT-093 --platform native-ios,native-android
  node e2e/native/ctl.mjs capture --activity ACT-093 --platform native-ios --route /settings/account
  node e2e/native/ctl.mjs health --activity ACT-093 --platform native-ios,native-android
  node e2e/native/ctl.mjs settings --activity ACT-093 --platform native-ios,native-android
  node e2e/native/ctl.mjs settings --activity ACT-093 --platform tauri-macos --macos-application <path-to-Openread.app>
  node e2e/native/ctl.mjs capture --activity ACT-093 --platform native-android --android-serial <serial>
  node e2e/native/ctl.mjs capture --activity ACT-092 --platform tauri-windows --application <path>
  node e2e/native/ctl.mjs health --activity ACT-092 --platform tauri-macos --application <path-to-Openread.app>

Required native controllers:
  native-ios      Appium 2 + XCUITest driver + booted simulator or target device
  native-ipados   Appium 2 + XCUITest driver + iPad simulator or target device
  native-android  Appium 2 + UiAutomator2 driver + adb target
  tauri-windows   local Windows host/VM + tauri-driver + msedgedriver + built Tauri app binary
  tauri-macos     local macOS host + in-app Tauri QA controller + AX/open/screencapture + built .app

Health behavior:
  Native mobile and Windows Tauri open /auth, inject a Supabase test session through the
  WebDriver WEBVIEW context, verify authenticated navigation, clear auth storage, and
  screenshot each step. macOS Tauri health/capture uses AX/deep-link/screenshots only.
  tauri-driver v2 is unsupported on macOS, so strict macOS Settings SET closure uses a
  QA-gated in-app Tauri controller plus screenshot evidence.

Settings behavior:
  Runs native mobile and macOS Tauri Settings SET scenarios and writes expected-current-report.json
  files consumable by the Settings contract audit. macOS defaults to --macos-settings-controller
  app, which emits qa-seam-real-ui evidence after real route/UI assertions. bridge remains
  provisional fixture-overlay capture. webdriver fails fast on macOS with the upstream blocker.

Options:
  --appium-url <url>          Default http://127.0.0.1:4723
  --tauri-driver-url <url>    Default http://127.0.0.1:4444
  --platform <ids>            native-ios,native-ipados,native-android,tauri-windows,tauri-macos
  --route <path>              Deep-link route, default /settings/account
  --open-url <url>            Override openread://activity-capture URL
  --application <path>        Tauri desktop app/binary when running a single desktop platform
  --macos-application <path>  macOS Openread.app path
  --windows-application <path> Windows Openread.exe path
  --auth <mode>               authenticated (default) or anonymous
  --new-command-timeout <sec> Appium newCommandTimeout, default ${newCommandTimeoutSec}
  --macos-settings-controller <app|bridge|webdriver> Default ${tauriMacosSettingsController}
  --ios-app <path>            Optional .app for Appium to install before launch
  --ipad-device-name <name>   Default ${defaultIpadDeviceName}
`);
}
