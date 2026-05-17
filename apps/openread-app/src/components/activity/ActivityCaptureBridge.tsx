'use client';

import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { isTauriAppPlatform } from '@/services/environment';
import { useAuth } from '@/context/AuthContext';
import { useEnv } from '@/context/EnvContext';
import { useLibraryStore } from '@/store/libraryStore';
import { navigateToReader } from '@/utils/nav';
import { createLogger } from '@/utils/logger';
import { parseActivityCaptureTarget, type ActivityCaptureTarget } from '@/helpers/activityCapture';
import { postTauriQaResult, runTauriQaController } from '@/helpers/tauriQaController';
import type { AppService } from '@/types/system';

const logger = createLogger('activityCaptureBridge');
const qaAutomationEnabled = process.env.NEXT_PUBLIC_OPENREAD_QA_AUTOMATION === '1';
const TAURI_QA_READER_BOOK_TITLE = 'OpenRead Tauri QA Reader Book';
const TAURI_QA_READER_BOOK_TEXT = `OpenRead Tauri QA Reader Book

This deterministic QA-only book gives the macOS Tauri Settings contract a real reader surface.

Chapter 1

The reader toolbar, Font & Layout dialog, settings panels, search, reset, and persistence controls are exercised against this local book during automation.`;

type QaEvidence = {
  scenarioId: string;
  title: string;
  text: string;
  route: string;
  plan: string;
};

export default function ActivityCaptureBridge() {
  const router = useRouter();
  const { login, logout } = useAuth();
  const { appService } = useEnv();
  const [qaEvidence, setQaEvidence] = useState<QaEvidence | null>(null);

  useEffect(() => {
    if (!isTauriAppPlatform() || !appService) return;

    const handleTarget = async (target: ActivityCaptureTarget) => {
      if (target.onboarding === 'skip') {
        localStorage.setItem('has_seen_welcome', 'true');
        localStorage.setItem('openread_onboarding_completed', new Date().toISOString());
      }

      if (target.qa === 'settings-contract') {
        if (!qaAutomationEnabled) {
          logger.warn('Ignoring activity capture QA target outside QA automation build');
          router.push(target.route);
          return;
        }

        const plan = normalizeQaPlan(target.qaPlan);
        if (target.auth === 'authenticated' || target.auth === 'qa') {
          await installQaAuthFromSessionUrl(login, target.qaSessionUrl);
        } else if (target.auth === 'anonymous') {
          await clearQaAuth(logout);
        }
        installTauriQaFetchRoutes();
        setQaEvidence({
          scenarioId: target.qaScenarioId ?? 'SET-000',
          title: target.qaTitle ?? 'Settings contract QA evidence',
          text: target.qaText ?? 'Settings contract QA evidence captured',
          route: target.route,
          plan,
        });
        logger.info('Opening activity capture QA route', {
          route: target.route,
          scenarioId: target.qaScenarioId,
          hasCallback: Boolean(target.qaCallbackUrl),
        });
        const wantsQaReader = target.screen === 'reader' || target.route.startsWith('/reader');
        if (wantsQaReader) {
          const bookHash = await ensureTauriQaReaderBook(appService);
          if (bookHash) {
            navigateToReader(router, [bookHash], undefined, { scroll: false });
          } else {
            logger.warn('QA reader target could not prepare a local book; opening requested route');
            router.push(target.route);
          }
        } else if (window.location.pathname !== target.route) {
          router.push(target.route);
        }
        if (target.qaCallbackUrl) {
          const controllerTarget = { ...target };
          const runWhenReady =
            target.qaScenarioId === 'SET-006' ? Promise.resolve() : waitForQaRoute(target.route);
          void runWhenReady
            .then(() => runTauriQaController(controllerTarget))
            .then((result) => postTauriQaResult(controllerTarget.qaCallbackUrl!, result))
            .catch((error) => {
              logger.error('Failed to post Tauri QA controller result', error);
            });
        }
        return;
      }

      const wantsReader =
        target.screen === 'reader' ||
        target.state?.includes('reader') ||
        target.route === '/reader';

      if (!wantsReader) {
        logger.info('Opening activity capture route', { route: target.route });
        router.push(target.route);
        return;
      }

      const storedLibrary = useLibraryStore.getState().library;
      const diskLibrary =
        storedLibrary.length > 0 ? storedLibrary : await appService.loadLibraryBooks();
      if (diskLibrary.length > 0 && storedLibrary.length === 0) {
        useLibraryStore.getState().setLibrary(diskLibrary);
      }

      const book = diskLibrary.find((entry) => !entry.deletedAt && entry.hash);
      if (!book) {
        logger.warn('Activity capture reader target has no local library book; opening library');
        router.push('/library');
        return;
      }

      logger.info('Opening activity capture reader target', { bookHash: book.hash });
      navigateToReader(router, [book.hash], undefined, { scroll: false });
    };

    const handleUrls = (urls: string[] | null) => {
      if (!urls) return;
      for (const url of urls) {
        const target = parseActivityCaptureTarget(url);
        if (target) {
          void handleTarget(target).catch((error) => {
            logger.error('Failed to open activity capture target', error);
            router.push(target.route);
          });
          return;
        }
      }
    };

    getCurrent()
      .then(handleUrls)
      .catch(() => {});
    const unlisten = onOpenUrl(handleUrls);

    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [appService, login, logout, router]);

  if (!qaEvidence) return null;

  return (
    <section
      data-openread-qa-settings-evidence={qaEvidence.scenarioId}
      aria-label={`${qaEvidence.scenarioId} desktop Tauri QA evidence`}
      className='bg-base-100 text-base-content border-base-content fixed left-4 top-4 z-[2147483647] max-w-[min(720px,calc(100vw-2rem))] rounded-xl border-2 p-4 shadow-2xl'
    >
      <p className='text-base-content/70 mb-1 text-xs font-semibold uppercase tracking-wide'>
        Desktop Tauri Settings Contract
      </p>
      <h2 className='mb-2 text-lg font-bold'>
        {qaEvidence.scenarioId} {qaEvidence.title}
      </h2>
      <p className='text-sm'>{qaEvidence.text}</p>
      <p className='text-base-content/60 mt-2 text-xs'>
        Route: {qaEvidence.route} · Plan: {qaEvidence.plan}
      </p>
    </section>
  );
}

async function clearQaAuth(logout: () => void) {
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  const storageKey = supabaseStorageKey();
  if (storageKey) localStorage.removeItem(storageKey);
  await Promise.resolve(logout()).catch((error) => {
    logger.warn('QA auth cleanup logout failed', error);
  });
}

async function ensureTauriQaReaderBook(appService: AppService): Promise<string | null> {
  try {
    const libraryStore = useLibraryStore.getState();
    let library = libraryStore.library;
    if (library.length === 0) {
      library = await appService.loadLibraryBooks();
      if (library.length > 0) libraryStore.setLibrary(library);
    }

    const existing = library.find(
      (book) => !book.deletedAt && book.title === TAURI_QA_READER_BOOK_TITLE && book.hash,
    );
    if (existing?.hash) return existing.hash;

    const reusable = library.find((book) => !book.deletedAt && book.hash);
    if (reusable?.hash) return reusable.hash;

    const file = new File([TAURI_QA_READER_BOOK_TEXT], 'openread-tauri-qa-reader.txt', {
      type: 'text/plain',
    });
    const imported = await appService.importBook(file, library, true, true, true);
    if (!imported?.hash) return null;

    const updatedLibrary = [...library];
    libraryStore.setLibrary(updatedLibrary);
    await appService.saveLibraryBooks(updatedLibrary);
    return imported.hash;
  } catch (error) {
    logger.warn('Failed to prepare Tauri QA reader book', error);
    return null;
  }
}

async function waitForQaRoute(route: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12_000) {
    if (route === '/settings') {
      if (window.location.pathname.startsWith('/settings')) return;
    } else if (route.startsWith('/reader')) {
      if (window.location.pathname.startsWith('/reader')) return;
    } else if (
      window.location.pathname === route ||
      window.location.pathname.startsWith(`${route}/`)
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function installQaAuthFromSessionUrl(
  login: (token: string, user: User) => void,
  qaSessionUrl: string | null,
) {
  if (!qaSessionUrl) {
    throw new Error('QA auth requested without a real test-user session URL.');
  }

  const response = await fetch(qaSessionUrl, { cache: 'no-store' });
  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const errorMessage =
      typeof payload === 'object' && payload && 'error' in payload
        ? String(payload.error)
        : response.statusText;
    throw new Error(`Failed to fetch QA test-user session: ${errorMessage}`);
  }

  const session = extractSessionPayload(payload);
  if (!session) {
    throw new Error('QA test-user session response was incomplete.');
  }

  localStorage.setItem('token', session.access_token);
  localStorage.setItem('refresh_token', session.refresh_token);
  localStorage.setItem('user', JSON.stringify(session.user));
  localStorage.setItem('has_seen_welcome', 'true');
  localStorage.setItem('openread_onboarding_completed', new Date().toISOString());

  const storageKey = supabaseStorageKey();
  if (storageKey) localStorage.setItem(storageKey, JSON.stringify(session));

  login(session.access_token, session.user);
}

function extractSessionPayload(payload: unknown): Session | null {
  const candidate =
    typeof payload === 'object' && payload && 'session' in payload
      ? (payload as { session?: unknown }).session
      : payload;
  if (!candidate || typeof candidate !== 'object') return null;
  const session = candidate as Partial<Session>;
  if (!session.access_token || !session.refresh_token || !session.user?.email) return null;
  return session as Session;
}

function normalizeQaPlan(value: string | null): 'free' | 'reader' | 'pro' {
  return value === 'free' || value === 'pro' ? value : 'reader';
}

function supabaseStorageKey() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return null;
    const projectRef = new URL(url).hostname.split('.')[0];
    return `sb-${projectRef}-auth-token`;
  } catch {
    return null;
  }
}

declare global {
  interface Window {
    __openreadTauriQaFetchInstalled?: boolean;
  }
}

function installTauriQaFetchRoutes() {
  if (typeof window === 'undefined' || window.__openreadTauriQaFetchInstalled) return;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const response = url ? tauriQaFetchResponse(url, init) : null;
    if (response) return response;
    return originalFetch(input, init);
  };
  window.__openreadTauriQaFetchInstalled = true;
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    if (typeof input === 'string') return new URL(input, window.location.origin);
    if (input instanceof URL) return input;
    return new URL(input.url, window.location.origin);
  } catch {
    return null;
  }
}

function tauriQaFetchResponse(url: URL, _init?: RequestInit): Response | null {
  if (!qaAutomationEnabled) return null;
  const path = url.pathname;

  if (path.endsWith('/api/stripe/plans')) return jsonResponse(tauriQaPlans());
  if (path.endsWith('/api/stripe/invoices')) return jsonResponse([]);
  if (path.endsWith('/api/stripe/checkout')) {
    return jsonResponse({ url: 'https://checkout.stripe.com/openread-tauri-qa' });
  }
  if (path.endsWith('/api/stripe/create-storage-checkout')) {
    return jsonResponse(
      {
        error: 'STORAGE_ADDONS_DISABLED',
        message: 'Storage add-ons are not offered. Upgrade your plan for more included storage.',
      },
      410,
    );
  }
  if (path.endsWith('/api/stripe/cancel-storage-addon')) {
    return jsonResponse(
      {
        error: 'STORAGE_ADDONS_DISABLED',
        message:
          'Storage add-ons are not offered. Manage storage by upgrading plans or removing files.',
      },
      410,
    );
  }
  if (path.endsWith('/api/stripe/portal')) {
    return jsonResponse({ url: 'https://billing.stripe.com/openread-tauri-qa' });
  }
  if (path.endsWith('/api/storage/quota')) {
    const gb = 1024 * 1024 * 1024;
    return jsonResponse({
      plan: 'reader',
      base_gb: 10,
      addon_gb: 0,
      total_bytes: 10 * gb,
      used_bytes: 0,
      available_bytes: 10 * gb,
      percent_used: 0,
      is_over_limit: false,
      active_addons: [],
      available_addons: [],
    });
  }

  return null;
}

function tauriQaPlans() {
  return [
    {
      plan: 'reader',
      productId: 'price_openread_tauri_qa_reader_monthly',
      price: 999,
      currency: 'USD',
      interval: 'month',
      productName: 'Reader Plan',
    },
    {
      plan: 'pro',
      productId: 'price_openread_tauri_qa_pro_monthly',
      price: 1999,
      currency: 'USD',
      interval: 'month',
      productName: 'Pro Plan',
    },
  ];
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
