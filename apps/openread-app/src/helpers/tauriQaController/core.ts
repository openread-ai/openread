import type { ActivityCaptureTarget } from '@/helpers/activityCapture';

export type TauriQaEvidenceMode = 'qa-seam-real-ui';

export type TauriQaAssertion = {
  label: string;
  ok: boolean;
  detail?: unknown;
};

export type TauriQaResult = {
  ok: boolean;
  feature: string;
  scenarioId: string;
  route: string;
  path: string;
  href: string;
  summary: string;
  assertions: TauriQaAssertion[];
  actions: string[];
  textSample: string;
  evidenceMode: TauriQaEvidenceMode;
  error?: string;
};

export type MutableTauriQaResult = Omit<TauriQaResult, 'ok'> & { ok?: boolean };

export type TauriQaScenario = {
  expectedText: string[];
  actions?: (target: ActivityCaptureTarget, result: MutableTauriQaResult) => Promise<void>;
};

export const DEFAULT_QA_TIMEOUT_MS = 12_000;

export function createTauriQaResult(
  feature: string,
  target: ActivityCaptureTarget,
): MutableTauriQaResult {
  return {
    feature,
    scenarioId: target.qaScenarioId ?? 'UNKNOWN',
    route: target.route,
    path: window.location.pathname,
    href: window.location.href,
    summary: `${feature} QA controller pending.`,
    assertions: [],
    actions: [],
    textSample: '',
    evidenceMode: 'qa-seam-real-ui',
  };
}

export function finishTauriQaResult(result: MutableTauriQaResult): TauriQaResult {
  result.path = window.location.pathname;
  result.href = window.location.href;
  result.textSample = sampleText();
  result.ok = result.assertions.every((assertion) => assertion.ok);
  result.summary = result.ok
    ? `${result.scenarioId} passed ${result.feature} QA-controller real UI assertions on ${result.path}.`
    : `${result.scenarioId} failed one or more ${result.feature} QA-controller assertions on ${result.path}.`;
  return result as TauriQaResult;
}

export function failTauriQaResult(result: MutableTauriQaResult, error: unknown): TauriQaResult {
  const message = error instanceof Error ? error.message : String(error);
  result.path = window.location.pathname;
  result.href = window.location.href;
  result.textSample = sampleText();
  result.error = message;
  result.summary = `${result.scenarioId} ${result.feature} QA-controller assertion failed: ${message}`;
  result.ok = false;
  addAssertion(result, 'exception-free QA controller execution', false, message);
  return result as TauriQaResult;
}

export async function postTauriQaResult(callbackUrl: string, result: TauriQaResult) {
  await fetch(callbackUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(result),
  });
}

export function addAssertion(
  result: MutableTauriQaResult,
  label: string,
  ok: boolean,
  detail?: unknown,
) {
  result.assertions.push({ label, ok, detail });
}

export function includesAll(text: string, values: string[]) {
  const lower = text.toLowerCase();
  return values.every((value) => lower.includes(value.toLowerCase()));
}

export function bodyText() {
  return document.body.innerText || '';
}

export function sampleText() {
  return bodyText().replace(/\s+/g, ' ').trim().slice(0, 1500);
}

export function routeReady(route: string) {
  if (route === '/settings') return window.location.pathname.startsWith('/settings');
  if (route.startsWith('/reader')) return window.location.pathname.startsWith('/reader');
  return window.location.pathname === route || window.location.pathname.startsWith(`${route}/`);
}

export async function clickByText(text: string) {
  const element = await waitFor(() => findClickableByText(text), DEFAULT_QA_TIMEOUT_MS);
  await clickElement(element);
  return element;
}

export async function clickElement(element: HTMLElement) {
  element.scrollIntoView({ block: 'center', inline: 'center' });
  element.click();
  await wait(350);
}

export async function focusByText(text: string) {
  const element = await waitFor(() => findClickableByText(text), DEFAULT_QA_TIMEOUT_MS);
  element.scrollIntoView({ block: 'center', inline: 'center' });
  element.focus();
  await wait(100);
  return element;
}

export function findClickableByText(text: string) {
  const needle = text.toLowerCase();
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('button,a,[role="button"],input,label'),
  );
  return candidates.find((element) => {
    if (!isVisible(element)) return false;
    const haystack = [element.getAttribute('aria-label'), element.textContent, element.title]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function findInputByNameOrLabel(pattern: RegExp) {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea'),
  );
  return inputs.find((input) => {
    const label = input.closest('label')?.textContent ?? '';
    return pattern.test(
      [input.name, input.id, input.placeholder, input.getAttribute('aria-label'), label]
        .filter(Boolean)
        .join(' '),
    );
  });
}

export function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export function isVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
  );
}

export async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor<T>(
  predicate: () => T | null | false | undefined,
  timeoutMs = DEFAULT_QA_TIMEOUT_MS,
) {
  const startedAt = Date.now();
  let lastError: unknown = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await wait(150);
  }
  const suffix = lastError instanceof Error ? ` Last error: ${lastError.message}` : '';
  throw new Error(`Timed out after ${timeoutMs}ms waiting for QA controller condition.${suffix}`);
}
