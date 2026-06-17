import type { User } from '@supabase/supabase-js';
import {
  AUTH_STORAGE_KEYS,
  BrowserAuthSessionStorage,
  isAccessTokenExpired,
  toAuthSession,
  type AuthChangeEvent,
  type AuthSession,
  type AuthSubscriber,
  type SupabaseLikeSession,
} from '@openread/auth';
import { supabase } from '@/utils/supabase';
import { isWebAppPlatform } from '@/services/environment';
import { createLogger } from '@/utils/logger';

const logger = createLogger('clientAuth');
const QA_FORCE_SIGNED_OUT_KEY = 'openread_qa_force_signed_out_until';

class ClientAuthAdapter {
  private readonly storage = new BrowserAuthSessionStorage();
  private subscribers = new Set<AuthSubscriber>();
  private session: AuthSession | null = null;
  private initialized = false;
  private refreshPromise: Promise<AuthSession | null> | null = null;
  private unsubscribeSupabase: (() => void) | null = null;

  getSnapshot(): AuthSession | null {
    if (!this.session && typeof window !== 'undefined') {
      this.session = this.storage.read();
    }
    return this.session;
  }

  subscribe(subscriber: AuthSubscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber({ session: this.getSnapshot(), reason: 'initial' });
    return () => this.subscribers.delete(subscriber);
  }

  initialize(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    this.session = this.storage.read();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, supabaseSession) => {
      const reason =
        event === 'SIGNED_OUT' ? 'logout' : event === 'TOKEN_REFRESHED' ? 'refresh' : 'login';
      this.acceptSupabaseSession(supabaseSession, reason);
    });
    this.unsubscribeSupabase = () => subscription?.subscription.unsubscribe();

    void this.restoreStoredSession();
  }

  destroy(): void {
    this.unsubscribeSupabase?.();
    this.unsubscribeSupabase = null;
    this.initialized = false;
  }

  async getAccessToken(): Promise<string | null> {
    if (!isWebAppPlatform()) {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token ?? null;
      if (!token) return null;
      if (!isAccessTokenExpired(token)) return token;
      const { data: refreshData, error } = await supabase.auth.refreshSession();
      const refreshedToken = refreshData?.session?.access_token ?? null;
      if (error || !refreshedToken || isAccessTokenExpired(refreshedToken)) return null;
      this.acceptSupabaseSession(refreshData.session, 'refresh');
      return refreshedToken;
    }

    const storedToken = this.getStoredAccessToken();
    if (!storedToken) {
      this.session = null;
      return null;
    }
    if (!isAccessTokenExpired(storedToken)) return storedToken;

    const refreshToken = this.getStoredRefreshToken();
    if (!refreshToken) {
      await this.clear('clear');
      return null;
    }

    const refreshed = await this.refreshSession(refreshToken);
    return refreshed?.accessToken ?? null;
  }

  async refreshIfNeeded(): Promise<AuthSession | null> {
    const current = this.getSnapshot();
    if (current?.accessToken && !isAccessTokenExpired(current.accessToken)) {
      return current;
    }

    if (this.refreshPromise) return this.refreshPromise;

    const refreshToken = isWebAppPlatform()
      ? (this.getStoredRefreshToken() ?? undefined)
      : undefined;
    this.refreshPromise = this.refreshSession(refreshToken);
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  async installSession(session: SupabaseLikeSession): Promise<AuthSession | null> {
    if (this.isQaForcedSignedOut()) return null;

    if (session.access_token && session.refresh_token) {
      const { data, error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (error) throw error;
      return this.acceptSupabaseSession(data.session, 'login');
    }

    return this.acceptSupabaseSession(session, 'login');
  }

  async logout(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      logger.warn('Supabase sign out failed:', error);
    } finally {
      void this.clear('logout');
    }
  }

  async clear(reason: AuthChangeEvent['reason'] = 'clear'): Promise<void> {
    this.storage.clear();
    this.session = null;
    this.notify({ session: null, reason });
  }

  forceQaSignedOut(windowMs = 30_000): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(QA_FORCE_SIGNED_OUT_KEY, String(Date.now() + windowMs));
  }

  clearQaForceSignedOut(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(QA_FORCE_SIGNED_OUT_KEY);
  }

  hasStoredSession(): boolean {
    const session = this.getSnapshot();
    return Boolean(session?.accessToken && session.user);
  }

  private async restoreStoredSession(): Promise<void> {
    if (this.isQaForcedSignedOut()) {
      await this.clear('clear');
      return;
    }

    const stored = this.storage.read();
    if (!stored?.accessToken || !stored.refreshToken) {
      if (stored) this.notify({ session: stored, reason: 'initial' });
      return;
    }

    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: stored.accessToken,
        refresh_token: stored.refreshToken,
      });
      if (!error && data.session) {
        this.acceptSupabaseSession(data.session, 'initial');
        return;
      }
      logger.warn('Stored session restore failed:', error);
      await this.clear('clear');
    } catch (error) {
      logger.warn('Stored session restore error:', error);
      await this.clear('clear');
    }
  }

  private async refreshSession(refreshToken?: string): Promise<AuthSession | null> {
    try {
      const { data, error } = await supabase.auth.refreshSession(
        refreshToken ? { refresh_token: refreshToken } : undefined,
      );
      if (error || !data.session) {
        await this.clear('clear');
        return null;
      }
      return this.acceptSupabaseSession(data.session, 'refresh');
    } catch (error) {
      logger.warn('Session refresh failed:', error);
      await this.clear('clear');
      return null;
    }
  }

  private acceptSupabaseSession(
    supabaseSession: SupabaseLikeSession | null | undefined,
    reason: AuthChangeEvent['reason'],
  ): AuthSession | null {
    if (this.isQaForcedSignedOut()) {
      void this.clear('clear');
      return null;
    }

    const session = toAuthSession(supabaseSession);
    if (!session) {
      void this.clear(reason === 'logout' ? 'logout' : 'clear');
      return null;
    }

    this.session = session;
    this.storage.write(session);
    this.notify({ session, reason });
    return session;
  }

  private getStoredAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(AUTH_STORAGE_KEYS.accessToken);
  }

  private getStoredRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken);
  }

  private isQaForcedSignedOut(): boolean {
    if (process.env.NEXT_PUBLIC_OPENREAD_QA_AUTOMATION !== '1') return false;
    if (typeof window === 'undefined') return false;
    const forceSignedOutUntil = Number(window.localStorage.getItem(QA_FORCE_SIGNED_OUT_KEY) ?? '0');
    return forceSignedOutUntil > Date.now();
  }

  private notify(event: AuthChangeEvent): void {
    for (const subscriber of this.subscribers) subscriber(event);
  }
}

export const clientAuth = new ClientAuthAdapter();

export function toSupabaseSessionInput(accessToken: string, user: User, refreshToken?: string) {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user,
  } satisfies SupabaseLikeSession;
}
