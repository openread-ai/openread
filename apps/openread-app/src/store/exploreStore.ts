import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ExploreState {
  // Filters (persisted)
  languages: string[];
  region: string;
  selectedCategory: string;

  // Search (not persisted)
  searchQuery: string;

  // Actions
  setLanguages: (languages: string[]) => void;
  setRegion: (region: string) => void;
  setSelectedCategory: (category: string) => void;
  setSearchQuery: (query: string) => void;
  resetFilters: () => void;
}

function detectDefaultLanguages(): string[] {
  return ['en'];
}

function normalizePersistedLanguages(value: unknown): string[] {
  return Array.isArray(value) && value.length === 0 ? [] : ['en'];
}

function detectDefaultRegion(): string {
  if (typeof navigator === 'undefined') return '';
  // Use timezone heuristic for region detection
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (
      tz.startsWith('Asia/Kolkata') ||
      tz.startsWith('Asia/Calcutta') ||
      tz.startsWith('Asia/Colombo')
    )
      return 'IN';
    if (tz.startsWith('America/')) return 'US';
  } catch {
    // Ignore — return empty (no region filter)
  }
  return '';
}

export const useExploreStore = create<ExploreState>()(
  persist(
    (set) => ({
      languages: detectDefaultLanguages(),
      region: detectDefaultRegion(),
      selectedCategory: '',
      searchQuery: '',

      setLanguages: (languages) => set({ languages: normalizePersistedLanguages(languages) }),
      setRegion: (region) => set({ region }),
      setSelectedCategory: (category) => set({ selectedCategory: category }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      resetFilters: () =>
        set({
          languages: detectDefaultLanguages(),
          region: detectDefaultRegion(),
          selectedCategory: '',
          searchQuery: '',
        }),
    }),
    {
      name: 'explore-storage',
      partialize: (state) => ({
        languages: state.languages,
        region: state.region,
        // selectedCategory intentionally NOT persisted — should reset to browse mode on page load
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<ExploreState>;
        return {
          ...current,
          ...persistedState,
          languages: normalizePersistedLanguages(persistedState.languages),
        };
      },
    },
  ),
);
