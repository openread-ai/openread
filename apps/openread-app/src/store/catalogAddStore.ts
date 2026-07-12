import { create } from 'zustand';
import type { ImportState } from '@/types/catalog';

interface CatalogAddStoreState {
  userId: string | null;
  importStates: Record<string, ImportState>;
  activateUser: (userId: string | null) => void;
  update: (catalogBookId: string, update: Partial<ImportState>) => void;
  reset: (catalogBookId: string) => void;
}

export const useCatalogAddStore = create<CatalogAddStoreState>((set) => ({
  userId: null,
  importStates: {},
  activateUser: (userId) =>
    set((state) => (state.userId === userId ? state : { userId, importStates: {} })),
  update: (catalogBookId, update) =>
    set((state) => ({
      importStates: {
        ...state.importStates,
        [catalogBookId]: {
          ...(state.importStates[catalogBookId] ?? { status: 'idle' }),
          ...update,
        },
      },
    })),
  reset: (catalogBookId) =>
    set((state) => {
      const importStates = { ...state.importStates };
      delete importStates[catalogBookId];
      return { importStates };
    }),
}));
