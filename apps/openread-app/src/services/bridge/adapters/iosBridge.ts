type IOSMessageHandlerName =
  | 'openreadColorPicker'
  | 'openreadColorPickerHide'
  | 'openreadFooterVisible'
  | 'openreadToolbarVisible'
  | 'openreadSidebarVisible'
  | 'openreadSelectionToolbar'
  | 'openreadRenameBook'
  | 'openreadCollectionPicker'
  | 'openreadCollectionToolbar'
  | 'openreadTextInput'
  | 'openreadChapterPull'
  | 'openreadChatComposer';

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: Partial<
        Record<IOSMessageHandlerName, { postMessage: (data: unknown) => void }>
      >;
    };
  }
}

export function hasIOSMessageHandler(handler: IOSMessageHandlerName): boolean {
  return !!getIOSMessageHandler(handler);
}

export function postIOSMessage(handler: IOSMessageHandlerName, payload: unknown): boolean {
  const messageHandler = getIOSMessageHandler(handler);
  if (!messageHandler) return false;
  messageHandler.postMessage(payload);
  return true;
}

function getIOSMessageHandler(handler: IOSMessageHandlerName) {
  if (typeof window === 'undefined') return undefined;
  return window.webkit?.messageHandlers?.[handler];
}
