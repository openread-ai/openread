import { runNativeCtlTarget } from './native-ctl.mjs';
import { runPlaywrightTarget } from './playwright.mjs';

const adapters = {
  'native-ctl': runNativeCtlTarget,
  playwright: runPlaywrightTarget,
};

export function runPlatformTarget({ activity, target, platform, attemptId, options }) {
  if (platform.enabled === false) {
    throw new Error(
      `Platform ${platform.id} is registered but disabled: ${platform.status ?? 'pending'}`,
    );
  }

  const runner = adapters[platform.adapter];
  if (!runner) {
    throw new Error(
      `Platform ${platform.id} uses adapter ${platform.adapter}, which is not implemented yet.`,
    );
  }
  return runner({ activity, target, platform, attemptId, options });
}

export function implementedAdapters() {
  return Object.keys(adapters);
}
