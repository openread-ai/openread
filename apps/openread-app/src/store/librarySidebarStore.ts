import { create } from 'zustand';

interface LibrarySidebarState {
  isVisible: boolean;
  width: string;

  setVisible: (visible: boolean) => void;
  setWidth: (width: string) => void;
  toggle: () => void;
  getWidth: () => string;
}

export const useLibrarySidebarStore = create<LibrarySidebarState>((set, get) => ({
  isVisible: false,
  width: '20%',

  setVisible: (visible: boolean) => set({ isVisible: visible }),
  setWidth: (width: string) => set({ width }),
  toggle: () => set((state) => ({ isVisible: !state.isVisible })),
  getWidth: () => get().width,
}));
