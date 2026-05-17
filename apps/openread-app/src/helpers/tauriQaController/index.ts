import type { ActivityCaptureTarget } from '@/helpers/activityCapture';
import { postTauriQaResult, type TauriQaResult } from './core';
import { runSettingsTauriQaController } from './settings';

export type { TauriQaAssertion, TauriQaResult } from './core';

export async function runTauriQaController(target: ActivityCaptureTarget): Promise<TauriQaResult> {
  if (target.qa === 'settings-contract') return runSettingsTauriQaController(target);

  return {
    ok: false,
    feature: target.qa ?? 'unknown',
    scenarioId: target.qaScenarioId ?? 'UNKNOWN',
    route: target.route,
    path: window.location.pathname,
    href: window.location.href,
    summary: `No Tauri QA controller registered for ${target.qa ?? 'unknown'}.`,
    assertions: [
      {
        label: 'registered Tauri QA controller exists',
        ok: false,
        detail: target.qa,
      },
    ],
    actions: [],
    textSample: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1500),
    evidenceMode: 'qa-seam-real-ui',
    error: `Unsupported Tauri QA controller: ${target.qa ?? 'unknown'}`,
  };
}

export { postTauriQaResult };
