import { Book } from '@/types/book';
import { isSameLang } from '@/utils/lang';
import { getLocale } from '@/utils/misc';

const DAILY_USAGE_KEY = 'translationDailyUsage';

/**
 * Maximum single translation request size in characters.
 */
export const MAX_TRANSLATION_REQUEST_SIZE = 50_000;

export const saveDailyUsage = (usage: number, date?: string) => {
  if (typeof window !== 'undefined') {
    const isoDate = date || new Date().toISOString().split('T')[0]!;
    const dailyUsage = { [isoDate]: usage };
    localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(dailyUsage));
  }
};

export const getDailyUsage = (date?: string): number | null => {
  if (typeof window !== 'undefined') {
    const isoDate = date || new Date().toISOString().split('T')[0]!;
    const usage = localStorage.getItem(DAILY_USAGE_KEY);
    if (usage) {
      const dailyUsage = JSON.parse(usage);
      if (dailyUsage[isoDate]) {
        return dailyUsage[isoDate];
      }
    }
  }
  return null;
};

/**
 * Check quota and increment usage counter.
 * Single-threaded JS prevents races within a tab,
 * but concurrent tabs may exceed quota due to localStorage TOCTOU.
 *
 * @param charCount - Number of characters to add
 * @param quota - Maximum allowed characters per day
 * @returns true if within quota and usage was incremented, false if would exceed
 */
export const checkAndIncrementUsage = (charCount: number, quota: number): boolean => {
  if (typeof window === 'undefined') return false;

  const isoDate = new Date().toISOString().split('T')[0]!;
  const raw = localStorage.getItem(DAILY_USAGE_KEY);
  const dailyUsage = raw ? JSON.parse(raw) : {};
  const currentUsage = dailyUsage[isoDate] || 0;

  if (currentUsage + charCount > quota) {
    return false;
  }

  // Atomically update (single-threaded JS ensures no race within a tab)
  dailyUsage[isoDate] = currentUsage + charCount;
  localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(dailyUsage));
  return true;
};

export const isTranslationAvailable = (book?: Book | null, targetLanguage?: string | null) => {
  if (!book || book.format === 'pdf') {
    return false;
  }

  const primaryLanguage = book.primaryLanguage || '';
  if (!primaryLanguage || primaryLanguage.toLowerCase() === 'und') {
    return false;
  }

  if (targetLanguage && isSameLang(primaryLanguage, targetLanguage)) {
    return false;
  }

  if (!targetLanguage && isSameLang(primaryLanguage, getLocale())) {
    return false;
  }

  return true;
};
