const ACTIVITY_CAPTURE_HOST = 'activity-capture';

export type ActivityCaptureTarget = {
  route: string;
  screen: string | null;
  state: string | null;
  book: string | null;
  auth: string | null;
  account: string | null;
  library: string | null;
  onboarding: string | null;
  qa: string | null;
  qaScenarioId: string | null;
  qaTitle: string | null;
  qaText: string | null;
  qaPlan: string | null;
  qaCallbackUrl: string | null;
  qaSessionUrl: string | null;
};

export function isActivityCaptureUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'openread:' && url.host === ACTIVITY_CAPTURE_HOST;
  } catch {
    return false;
  }
}

export function parseActivityCaptureRoute(value: string): string | null {
  return parseActivityCaptureTarget(value)?.route ?? null;
}

export function parseActivityCaptureTarget(value: string): ActivityCaptureTarget | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'openread:' || url.host !== ACTIVITY_CAPTURE_HOST) return null;

    const route = url.searchParams.get('route') || '/';
    const safeRoute = !route.startsWith('/') || route.startsWith('//') ? '/' : route;

    return {
      route: safeRoute,
      screen: url.searchParams.get('screen'),
      state: url.searchParams.get('state'),
      book: url.searchParams.get('book'),
      auth: url.searchParams.get('auth'),
      account: url.searchParams.get('account'),
      library: url.searchParams.get('library'),
      onboarding: url.searchParams.get('onboarding'),
      qa: url.searchParams.get('qa'),
      qaScenarioId: url.searchParams.get('qaScenarioId'),
      qaTitle: url.searchParams.get('qaTitle'),
      qaText: url.searchParams.get('qaText'),
      qaPlan: url.searchParams.get('qaPlan'),
      qaCallbackUrl: safeCallbackUrl(url.searchParams.get('qaCallbackUrl')),
      qaSessionUrl: safeCallbackUrl(url.searchParams.get('qaSessionUrl')),
    };
  } catch {
    return null;
  }
}

function safeCallbackUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:') return null;
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return null;
    return url.toString();
  } catch {
    return null;
  }
}
