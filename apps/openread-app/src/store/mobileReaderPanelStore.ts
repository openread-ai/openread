import { create } from 'zustand';
import type { MobileReaderPanelDestination } from '@/app/reader/utils/mobileReaderPanels';

interface ActiveMobileReaderPanel {
  bookKey: string;
  destination: MobileReaderPanelDestination;
}

interface MobileReaderPanelState {
  activePanel: ActiveMobileReaderPanel | null;
  openMobileReaderPanel: (bookKey: string, destination: MobileReaderPanelDestination) => void;
  closeMobileReaderPanel: () => void;
}

export const useMobileReaderPanelStore = create<MobileReaderPanelState>((set) => ({
  activePanel: null,
  openMobileReaderPanel: (bookKey, destination) => set({ activePanel: { bookKey, destination } }),
  closeMobileReaderPanel: () => set({ activePanel: null }),
}));
