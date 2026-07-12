import { AUTH_STORAGE_KEYS } from '@openread/auth';

export type PersistenceScope =
  | 'auth-owned'
  | 'sync-owned'
  | 'setting-syncable'
  | 'setting-local-only'
  | 'cache-only'
  | 'qa-only'
  | 'derived'
  | 'migration-only';

export type PersistenceStorageArea = 'localStorage' | 'sessionStorage';

export interface LocalPersistenceEntry {
  key: string;
  storage: PersistenceStorageArea;
  owner: string;
  scope: PersistenceScope;
  description: string;
  deletionCriteria?: string;
}

export const LOCAL_PERSISTENCE_KEYS = {
  authAccessToken: AUTH_STORAGE_KEYS.accessToken,
  authRefreshToken: AUTH_STORAGE_KEYS.refreshToken,
  authUser: AUTH_STORAGE_KEYS.user,
  qaForceSignedOutUntil: 'openread_qa_force_signed_out_until',
  qaLastError: 'openread_qa_last_error',
  platformBooksSeeded: 'openread_platform_books_seeded',
  libraryOwnerUserId: 'openread_library_owner_user_id',
  libraryPaintCache: 'openread_library_paint_cache_v1',
  exploreCollectionsCache: 'openread_explore_collections_cache_v1',
  lastLibraryParams: 'lastLibraryParams',
  telemetryConsent: 'openread-telemetry-consent',
  telemetryOptOut: 'openread-telemetry-opt-out',
  i18nextLanguage: 'i18nextLng',
  notificationPreferences: 'notificationPreferences',
  openreadPreferences: 'openread-preferences',
  customThemes: 'customThemes',
  lastConfigPanel: 'lastConfigPanel',
  customShortcuts: 'customShortcuts',
  recentCommands: 'recentCommands',
  transferQueue: 'openread_transfer_queue',
  deviceId: 'openread_device_id',
  translationDailyUsage: 'translationDailyUsage',
  themeMode: 'themeMode',
  themeColor: 'themeColor',
  ttsPreferredVoices: 'ttsPreferredVoices',
  lastAppUpdateCheck: 'lastAppUpdateCheck',
  lastShownReleaseNotesVersion: 'lastShownReleaseNotesVersion',
} as const;

export const LOCAL_PERSISTENCE_PREFIXES = {
  supabaseAuthToken: 'sb-',
  readerSearchHistory: 'search-history-',
  avatarCache: 'avatar_',
  settingsCache: 'openread:settings-cache:',
  emptyLibraryOnboarding: 'openread:empty-library-onboarding:',
  rsvpWordsPerMinute: 'openread_rsvp_wpm_',
  rsvpPunctuationPause: 'openread_rsvp_pause_',
  rsvpPosition: 'openread_rsvp_pos_',
  syncCursor: 'openread:sync-cursor',
  catalogAdd: 'openread.catalog-add.v1.',
} as const;

export const LOCAL_PERSISTENCE_REGISTRY = [
  {
    key: LOCAL_PERSISTENCE_KEYS.authAccessToken,
    storage: 'localStorage',
    owner: '@openread/auth/BrowserAuthSessionStorage',
    scope: 'auth-owned',
    description: 'Canonical browser access token key owned by @openread/auth.',
    deletionCriteria: 'Remove only through auth logout/session-clear paths.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.authRefreshToken,
    storage: 'localStorage',
    owner: '@openread/auth/BrowserAuthSessionStorage',
    scope: 'auth-owned',
    description: 'Canonical browser refresh token key owned by @openread/auth.',
    deletionCriteria: 'Remove only through auth logout/session-clear paths.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.authUser,
    storage: 'localStorage',
    owner: '@openread/auth/BrowserAuthSessionStorage',
    scope: 'auth-owned',
    description: 'Serialized authenticated user snapshot owned by @openread/auth.',
    deletionCriteria: 'Remove only through auth logout/session-clear paths.',
  },
  {
    key: `${LOCAL_PERSISTENCE_PREFIXES.supabaseAuthToken}*auth-token`,
    storage: 'localStorage',
    owner: 'Supabase auth client / ActivityCaptureBridge QA cleanup',
    scope: 'auth-owned',
    description: 'Supabase project-scoped auth token cache key used by Supabase client internals.',
    deletionCriteria: 'Remove only during explicit auth cleanup or QA auth reset.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.qaForceSignedOutUntil,
    storage: 'localStorage',
    owner: 'services/auth/clientAuth',
    scope: 'qa-only',
    description: 'Temporary QA automation sentinel to force client auth into signed-out state.',
    deletionCriteria: 'Expires by timestamp or explicit QA cleanup.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.qaLastError,
    storage: 'localStorage',
    owner: 'app/global-error and app/(platform)/error',
    scope: 'qa-only',
    description: 'Last captured app error detail for QA automation/debug evidence.',
    deletionCriteria: 'May be cleared after QA collection or app reset.',
  },
  {
    key: `${LOCAL_PERSISTENCE_PREFIXES.syncCursor}*`,
    storage: 'localStorage',
    owner: 'services/sync/cursors',
    scope: 'sync-owned',
    description: 'Per-user/per-table canonical sync cursor keys.',
    deletionCriteria: 'Reset only through sync cursor reset helpers when account/context changes.',
  },
  {
    key: `${LOCAL_PERSISTENCE_PREFIXES.catalogAdd}*`,
    storage: 'localStorage',
    owner: 'services/catalogAddCoordinator',
    scope: 'sync-owned',
    description:
      'Per-user durable Catalog Add idempotency keys and request IDs used for crash/reload recovery.',
    deletionCriteria: 'Remove only after terminal Add state or explicit user reset.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.libraryOwnerUserId,
    storage: 'localStorage',
    owner: 'services/libraryPaintCache and services/sync/syncWorker',
    scope: 'sync-owned',
    description:
      'Current library owner sentinel used to clear derived local data on account switch.',
    deletionCriteria: 'Overwrite/reset when authenticated account changes.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.notificationPreferences,
    storage: 'localStorage',
    owner: 'services/settings/settingsLocalAdapter',
    scope: 'setting-local-only',
    description: 'Local notification preferences not currently part of syncable SystemSettings.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.customShortcuts,
    storage: 'localStorage',
    owner: 'services/settings/settingsLocalAdapter',
    scope: 'setting-local-only',
    description: 'User keyboard shortcut overrides stored locally per device.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.ttsPreferredVoices,
    storage: 'localStorage',
    owner: 'services/settings/settingsLocalAdapter',
    scope: 'setting-local-only',
    description: 'Per-device TTS preferred client and voice selections.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.themeMode,
    storage: 'localStorage',
    owner: 'services/settings/settingsLocalAdapter',
    scope: 'setting-local-only',
    description: 'Per-device theme mode used before async settings load.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.themeColor,
    storage: 'localStorage',
    owner: 'services/settings/settingsLocalAdapter',
    scope: 'setting-local-only',
    description: 'Per-device theme color used before async settings load.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.deviceId,
    storage: 'localStorage',
    owner: 'services/settings/settingsLocalAdapter and services/deviceService',
    scope: 'setting-local-only',
    description: 'Stable per-browser/per-device identifier for sync and device-specific behavior.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.telemetryConsent,
    storage: 'localStorage',
    owner: 'utils/telemetry',
    scope: 'setting-local-only',
    description: 'Local opt-in flag for telemetry/PostHog enablement.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.telemetryOptOut,
    storage: 'localStorage',
    owner: 'utils/telemetry',
    scope: 'setting-local-only',
    description: 'Local telemetry opt-out flag.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.i18nextLanguage,
    storage: 'localStorage',
    owner: 'i18next browser language detector',
    scope: 'setting-local-only',
    description: 'Language selected/cached by i18next-browser-languagedetector.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.lastConfigPanel,
    storage: 'localStorage',
    owner: 'components/settings/SettingsDialog',
    scope: 'setting-local-only',
    description: 'Last opened settings panel for local UI continuity.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.openreadPreferences,
    storage: 'localStorage',
    owner: 'legacy settings migration/reset cleanup',
    scope: 'migration-only',
    description: 'Legacy preferences key cleared by reset flows; not a current write target.',
    deletionCriteria: 'Safe to remove during preferences reset or after legacy migration removal.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.customThemes,
    storage: 'localStorage',
    owner: 'legacy theme reset cleanup',
    scope: 'migration-only',
    description:
      'Legacy custom themes key cleared by privacy reset; current themes live in settings.',
    deletionCriteria: 'Safe to remove during privacy/settings reset.',
  },
  {
    key: `${LOCAL_PERSISTENCE_PREFIXES.settingsCache}*`,
    storage: 'localStorage',
    owner: 'services/settings/settingsCache',
    scope: 'cache-only',
    description: 'JSON cache prefix for settings/service bootstrap values.',
    deletionCriteria: 'Cache may be cleared whenever source-of-truth settings are refreshed.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.libraryPaintCache,
    storage: 'localStorage',
    owner: 'services/libraryPaintCache',
    scope: 'cache-only',
    description: 'Derived library paint cache for fast initial render; not source-of-truth.',
    deletionCriteria: 'Clear on account change, cache version change, or paint cache expiry.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.exploreCollectionsCache,
    storage: 'localStorage',
    owner: 'hooks/useExploreCollections',
    scope: 'cache-only',
    description: 'Explore collections response cache with TTL.',
    deletionCriteria: 'Clear when cache TTL expires or fetch succeeds with fresh data.',
  },
  {
    key: `${LOCAL_PERSISTENCE_PREFIXES.readerSearchHistory}*`,
    storage: 'localStorage',
    owner: 'app/reader/components/sidebar/SearchBar',
    scope: 'cache-only',
    description: 'Per-book reader search history cache.',
    deletionCriteria: 'Clear when the user clears reader search history.',
  },
  {
    key: `${LOCAL_PERSISTENCE_PREFIXES.avatarCache}*`,
    storage: 'localStorage',
    owner: 'components/UserAvatar',
    scope: 'cache-only',
    description: 'Base64 avatar image cache keyed by source URL.',
    deletionCriteria: 'May be cleared when storage pressure occurs or avatar source changes.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.recentCommands,
    storage: 'localStorage',
    owner: 'services/commandRegistry',
    scope: 'derived',
    description: 'Derived recent command IDs for command palette ordering.',
    deletionCriteria: 'May be cleared without data loss.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.transferQueue,
    storage: 'localStorage',
    owner: 'services/transferManager',
    scope: 'derived',
    description: 'Recoverable transfer queue snapshot for in-flight upload/download work.',
    deletionCriteria: 'Clear when transfer queue drains or is rebuilt from source state.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.translationDailyUsage,
    storage: 'localStorage',
    owner: 'services/translators/utils',
    scope: 'derived',
    description: 'Local daily translation usage counter; advisory client-side limit only.',
    deletionCriteria: 'Resets when the local usage date changes.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.lastLibraryParams,
    storage: 'sessionStorage',
    owner: 'utils/nav',
    scope: 'derived',
    description: 'Session-only library query params for back navigation.',
    deletionCriteria: 'Browser session end or navigation reset.',
  },
  {
    key: `${LOCAL_PERSISTENCE_PREFIXES.emptyLibraryOnboarding}*`,
    storage: 'localStorage',
    owner: 'hooks/useEmptyLibraryOnboarding and ActivityCaptureBridge',
    scope: 'setting-local-only',
    description: 'Account-scoped empty-library onboarding completion sentinel.',
    deletionCriteria: 'May be cleared to replay empty-library onboarding for one browser account.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.platformBooksSeeded,
    storage: 'localStorage',
    owner: 'hooks/usePlatformBooks',
    scope: 'derived',
    description: 'Local sentinel preventing repeated built-in platform book seeding.',
    deletionCriteria: 'May be cleared when platform seed behavior changes or library resets.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.lastAppUpdateCheck,
    storage: 'localStorage',
    owner: 'helpers/updater',
    scope: 'derived',
    description: 'Timestamp throttle for update checks.',
    deletionCriteria: 'May be cleared to force an update check.',
  },
  {
    key: LOCAL_PERSISTENCE_KEYS.lastShownReleaseNotesVersion,
    storage: 'localStorage',
    owner: 'helpers/updater',
    scope: 'derived',
    description: 'Last app version whose release notes were shown locally.',
    deletionCriteria: 'May be cleared to show release notes again.',
  },
  {
    key: `${LOCAL_PERSISTENCE_PREFIXES.rsvpWordsPerMinute}*`,
    storage: 'localStorage',
    owner: 'services/rsvp/RSVPController',
    scope: 'setting-local-only',
    description: 'Per-book RSVP words-per-minute preference.',
  },
  {
    key: `${LOCAL_PERSISTENCE_PREFIXES.rsvpPunctuationPause}*`,
    storage: 'localStorage',
    owner: 'services/rsvp/RSVPController',
    scope: 'setting-local-only',
    description: 'Per-book RSVP punctuation pause preference.',
  },
  {
    key: `${LOCAL_PERSISTENCE_PREFIXES.rsvpPosition}*`,
    storage: 'localStorage',
    owner: 'services/rsvp/RSVPController',
    scope: 'derived',
    description: 'Per-book RSVP reading position progress.',
    deletionCriteria: 'Remove when RSVP position is reset or book identity changes.',
  },
] as const satisfies readonly LocalPersistenceEntry[];

const registeredExactKeys = new Set<string>(LOCAL_PERSISTENCE_REGISTRY.map((entry) => entry.key));
const registeredPrefixes = LOCAL_PERSISTENCE_REGISTRY.map((entry) =>
  entry.key.endsWith('*') ? entry.key.slice(0, -1) : null,
).filter((key): key is string => Boolean(key));

export function isRegisteredLocalPersistenceKey(key: string): boolean {
  return (
    registeredExactKeys.has(key) || registeredPrefixes.some((prefix) => key.startsWith(prefix))
  );
}
