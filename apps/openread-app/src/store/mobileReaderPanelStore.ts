import { create } from 'zustand';
import type {
  MobileAIChatInitialView,
  MobileReaderPanelDestination,
} from '@/app/reader/utils/mobileReaderPanels';

export interface ActiveMobileReaderPanel {
  bookKey: string;
  destination: MobileReaderPanelDestination;
  initialQuestion?: string;
  initialQuestionConversationId?: string;
  initialAIChatView?: MobileAIChatInitialView;
}

export interface MobileReaderPanelState {
  activePanel: ActiveMobileReaderPanel | null;
  openMobileReaderPanel: (
    bookKey: string,
    destination: MobileReaderPanelDestination,
    options?: {
      initialQuestion?: string;
      initialQuestionConversationId?: string;
      initialAIChatView?: MobileAIChatInitialView;
    },
  ) => void;
  closeMobileReaderPanel: () => void;
  clearInitialQuestion: () => void;
}

export const selectIsAnyMobileReaderPanelOpen = (
  state: Pick<MobileReaderPanelState, 'activePanel'>,
) => state.activePanel !== null;

export const selectIsMobileReaderPanelOpenForBook = (bookKey: string) =>
  function isMobileReaderPanelOpenForBook(state: Pick<MobileReaderPanelState, 'activePanel'>) {
    return state.activePanel?.bookKey === bookKey;
  };

export const selectIsMobileReaderPanelDestinationOpenForBook = (
  bookKey: string,
  destination: MobileReaderPanelDestination,
) =>
  function isMobileReaderPanelDestinationOpenForBook(
    state: Pick<MobileReaderPanelState, 'activePanel'>,
  ) {
    return state.activePanel?.bookKey === bookKey && state.activePanel.destination === destination;
  };

export const useMobileReaderPanelStore = create<MobileReaderPanelState>((set) => ({
  activePanel: null,
  openMobileReaderPanel: (bookKey, destination, options) =>
    set({
      activePanel: {
        bookKey,
        destination,
        initialQuestion: options?.initialQuestion,
        initialQuestionConversationId: options?.initialQuestionConversationId,
        initialAIChatView:
          options?.initialAIChatView ?? (options?.initialQuestion ? 'active' : 'history'),
      },
    }),
  closeMobileReaderPanel: () => set({ activePanel: null }),
  clearInitialQuestion: () =>
    set((state) =>
      state.activePanel
        ? {
            activePanel: {
              ...state.activePanel,
              initialQuestion: undefined,
              initialQuestionConversationId: undefined,
            },
          }
        : state,
    ),
}));
