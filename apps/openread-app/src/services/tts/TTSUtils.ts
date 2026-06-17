import { settingsLocalAdapter } from '@/services/settings/settingsLocalAdapter';
import { TTSVoice } from './types';

export class TTSUtils {
  private static readonly PREFERRED_CLIENT_FIELD = 'preferredClient';

  private static normalizeLanguage(language: string): string {
    if (!language) return 'n/a';
    return language.toLowerCase().slice(0, 2);
  }

  static setPreferredClient(engine: string): void {
    if (!engine) return;
    const preferences = this.getPreferences();
    preferences[this.PREFERRED_CLIENT_FIELD] = engine;
    settingsLocalAdapter.setTtsPreferences(preferences);
  }

  static setPreferredVoice(engine: string, language: string, voiceId: string): void {
    if (!engine || !language || !voiceId) return;
    const preferences = this.getPreferences();
    const lang = this.normalizeLanguage(language);
    preferences[`${engine}-${lang}`] = voiceId;
    settingsLocalAdapter.setTtsPreferences(preferences);
  }

  static getPreferredClient(): string | null {
    const preferences = this.getPreferences();
    return preferences[this.PREFERRED_CLIENT_FIELD] || null;
  }

  static getPreferredVoice(engine: string, language: string): string | null {
    const preferences = this.getPreferences();
    const lang = this.normalizeLanguage(language);
    return preferences[`${engine}-${lang}`] || null;
  }

  private static getPreferences(): Record<string, string> {
    return settingsLocalAdapter.getTtsPreferences();
  }

  static sortVoicesFunc(a: TTSVoice, b: TTSVoice): number {
    const aRegion = a.lang.split('-')[1] || '';
    const bRegion = b.lang.split('-')[1] || '';
    if (aRegion === bRegion) {
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    }
    if (aRegion === 'CN') return -1;
    if (bRegion === 'CN') return 1;
    if (aRegion === 'TW') return -1;
    if (bRegion === 'TW') return 1;
    if (aRegion === 'HK') return -1;
    if (bRegion === 'HK') return 1;
    if (aRegion === 'US') return -1;
    if (bRegion === 'US') return 1;
    if (aRegion === 'GB') return -1;
    if (bRegion === 'GB') return 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  }
}
