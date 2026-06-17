import { bridge } from './bridgeService';

declare global {
  interface Window {
    __nativeTextSelectionAction?: (action: string, color?: string, style?: string) => void;
    __nativeFooterAction?: (action: string) => void;
    __nativeMenuAction?: () => void;
    __nativeSidebarClose?: () => void;
    __nativeSelectionAction?: (action: string, param?: string) => void;
    __nativeCollectionBack?: () => void;
    __nativeCollectionAction?: (action: string, collectionId?: string, value?: string) => void;
    __nativeCollectionCreate?: () => void;
    __nativeCollectionSearch?: () => void;
    __nativeCollectionResult?: (result: {
      selectedIds: string[];
      newNames: string[];
      bookHashes: string[];
    }) => void;
    __nativeBookRename?: (bookHash: string, title: string) => void;
    __nativeTextInputResult?: (callbackId: string, value: string) => void;
    __openreadNativeChatSend?: (text: string) => void;
    __openreadNativeChatCancel?: () => void;
    onNativeKeyDown?: (keyName: string) => boolean;
    onNativeTouch?: (event: { x: number; y: number; [key: string]: unknown }) => void;
  }
}

let registered = false;

export function registerNativeCallbacks(): void {
  if (registered || typeof window === 'undefined') return;
  registered = true;

  defineNativeCallback(
    '__nativeTextSelectionAction',
    (action: string, color?: string, style?: string) => {
      void bridge.emit('textSelectionAction', { action, color, style });
    },
  );
  defineNativeCallback('__nativeFooterAction', (action: string) => {
    void bridge.emit('nativeFooterAction', { action });
  });
  defineNativeCallback('__nativeMenuAction', () => {
    void bridge.emit('nativeMenuAction', {});
  });
  defineNativeCallback('__nativeSidebarClose', () => {
    void bridge.emit('nativeSidebarClose', {});
  });
  defineNativeCallback('__nativeSelectionAction', (action: string, param?: string) => {
    void bridge.emit('nativeSelectionAction', { action, param });
  });
  defineNativeCallback('__nativeCollectionBack', () => {
    void bridge.emit('nativeCollectionBack', {});
  });
  defineNativeCallback(
    '__nativeCollectionAction',
    (action: string, collectionId?: string, value?: string) => {
      void bridge.emit('nativeCollectionAction', { action, collectionId, value });
    },
  );
  defineNativeCallback('__nativeCollectionCreate', () => {
    void bridge.emit('nativeCollectionCreate', {});
  });
  defineNativeCallback('__nativeCollectionSearch', () => {
    void bridge.emit('nativeCollectionSearch', {});
  });
  defineNativeCallback(
    '__nativeCollectionResult',
    (result: { selectedIds: string[]; newNames: string[]; bookHashes: string[] }) => {
      void bridge.emit('nativeCollectionResult', result);
    },
  );
  defineNativeCallback('__nativeBookRename', (bookHash: string, title: string) => {
    void bridge.emit('nativeBookRename', { bookHash, title });
  });
  defineNativeCallback('__nativeTextInputResult', (callbackId: string, value: string) => {
    void bridge.emit('nativeTextInputResult', { callbackId, value });
  });
  defineNativeCallback('__openreadNativeChatSend', (text: string) => {
    void bridge.emit('nativeChatSend', { text });
  });
  defineNativeCallback('__openreadNativeChatCancel', () => {
    void bridge.emit('nativeChatCancel', {});
  });
  defineNativeCallback('onNativeKeyDown', (keyName: string) => {
    const consumed = bridge.emitSync('nativeKeyDown', { keyName });
    if (!consumed && (keyName === 'VolumeUp' || keyName === 'VolumeDown')) {
      void bridge.emit('nativeKeyDown', { keyName });
    }
    return consumed;
  });
  defineNativeCallback(
    'onNativeTouch',
    (event: { x: number; y: number; [key: string]: unknown }) => {
      void bridge.emit('nativeTouch', event);
    },
  );
}

function defineNativeCallback(name: keyof Window, value: unknown): void {
  if (Object.prototype.hasOwnProperty.call(window, name)) return;
  Object.defineProperty(window, name, {
    value,
    writable: false,
    configurable: false,
  });
}
