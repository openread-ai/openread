import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LibraryGroupByType } from '@/types/settings';

export type GridSize = 'small' | 'medium' | 'large';

interface LibraryViewState {
  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Grid size (persisted)
  gridSize: GridSize;
  setGridSize: (size: GridSize) => void;

  // Group by (persisted)
  groupBy: LibraryGroupByType;
  setGroupBy: (groupBy: LibraryGroupByType) => void;

  // Multi-select mode
  isSelectMode: boolean;
  selectedBooks: string[]; // book hashes
  setSelectMode: (enabled: boolean) => void;
  toggleBookSelection: (hash: string) => void;
  selectAll: (hashes: string[]) => void;
  clearSelection: () => void;
}

export const useLibraryViewStore = create<LibraryViewState>()(
  persist(
    (set, get) => ({
      // Search
      searchQuery: '',
      setSearchQuery: (query) => set({ searchQuery: query }),

      // Grid size
      gridSize: 'medium',
      setGridSize: (size) => set({ gridSize: size }),

      // Group by
      groupBy: 'manual',
      setGroupBy: (groupBy) => set({ groupBy }),

      // Multi-select
      isSelectMode: false,
      selectedBooks: [],
      setSelectMode: (enabled) =>
        set({
          isSelectMode: enabled,
          // Clear selection when exiting select mode
          selectedBooks: enabled ? get().selectedBooks : [],
        }),
      toggleBookSelection: (hash) =>
        set((state) => ({
          selectedBooks: state.selectedBooks.includes(hash)
            ? state.selectedBooks.filter((h) => h !== hash)
            : [...state.selectedBooks, hash],
        })),
      selectAll: (hashes) => set({ selectedBooks: hashes }),
      clearSelection: () => set({ selectedBooks: [] }),
    }),
    {
      name: 'library-view-storage',
      // Only persist gridSize and groupBy
      partialize: (state) => ({ gridSize: state.gridSize, groupBy: state.groupBy }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<LibraryViewState>),
      }),
    },
  ),
);
