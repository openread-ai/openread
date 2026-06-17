import { bridge } from '@/services/bridge/bridgeService';
import { eventDispatcher } from '@/utils/event';
import type { AnnotationActionEvent } from './menuConfig';
import {
  ANNOTATION_ACTION_EVENT,
  HIGHLIGHT_COLORS,
  HIGHLIGHT_STYLES,
  MENU_GROUPS,
} from './menuConfig';
import type { HighlightColor, HighlightStyle } from '@/types/book';

/** Runtime validation sets — derived from menuConfig to stay in sync automatically. */
const VALID_ACTIONS: Set<string> = new Set(
  MENU_GROUPS.flatMap((g) => g.items.map((i) => i.action)),
);
const VALID_STYLES: Set<string> = new Set(HIGHLIGHT_STYLES.map((s) => s.id));
const VALID_COLORS: Set<string> = new Set(HIGHLIGHT_COLORS.map((c) => c.id));

function handleNativeAction(action: string, color?: string, style?: string): void {
  // Runtime validation: reject unknown actions to prevent spoofing from
  // EPUB-embedded scripts that may access window.parent globals.
  if (!VALID_ACTIONS.has(action)) return;
  if (style && !VALID_STYLES.has(style)) return;
  if (color && !VALID_COLORS.has(color)) return;

  const event: AnnotationActionEvent = {
    action: action as AnnotationActionEvent['action'],
    color: color as HighlightColor | undefined,
    style: style as HighlightStyle | undefined,
  };
  eventDispatcher.dispatch(ANNOTATION_ACTION_EVENT, event);
}

/**
 * Register the typed native text-selection bridge listener.
 * Safe to call multiple times — only registers once.
 */
let registered = false;

export function registerNativeMenuBridge(): void {
  if (registered || typeof window === 'undefined') return;
  registered = true;

  bridge.on('textSelectionAction', ({ action, color, style }) => {
    handleNativeAction(action, color, style);
  });
}

/**
 * Programmatic trigger — used by desktop (Tauri Menu) and web (Radix)
 * context menus which don't go through the native bridge.
 */
export function dispatchAnnotationAction(event: AnnotationActionEvent): void {
  eventDispatcher.dispatch(ANNOTATION_ACTION_EVENT, event);
}

/**
 * Compute viewport-relative coordinates from a selection range inside an iframe.
 * Returns the center-x of the range and the top-y, translated to the main viewport.
 */
export function getViewportCoordsFromRange(range: Range | null | undefined): {
  x: number;
  y: number;
} {
  const rangeRect = range?.getBoundingClientRect();
  const iframe = range?.startContainer?.ownerDocument?.defaultView?.frameElement;
  const iframeRect = iframe?.getBoundingClientRect() ?? { top: 0, left: 0 };
  return {
    x: (rangeRect?.x ?? 0) + iframeRect.left + (rangeRect?.width ?? 0) / 2,
    y: (rangeRect?.y ?? 0) + iframeRect.top,
  };
}

/** Show the native iOS UIKit color picker at the given screen coordinates. */
export function showNativeColorPicker(
  x: number,
  y: number,
  selectedColor: string,
  showDelete: boolean,
): void {
  void bridge.send('openColorPicker', { x, y, selectedColor, showDelete });
}

/** Check if native bridge message handlers are available. */
export function isNativeAvailable(): boolean {
  return bridge.can('setFooterVisible');
}

/** Show native iOS text input alert. Result sent through bridge.on('nativeTextInputResult'). */
export function showNativeTextInputAlert(
  title: string,
  message: string,
  placeholder: string,
  defaultValue: string,
  callbackId: string,
): void {
  void bridge.send('openTextInput', {
    title,
    message,
    placeholder,
    defaultValue,
    callbackId,
  });
}

/** Hide the native iOS UIKit color picker. */
export function hideNativeColorPicker(): void {
  void bridge.send('hideColorPicker', {});
}

/** Show/hide the native iOS UIKit footer bar. */
export function setNativeFooterVisible(visible: boolean): void {
  void bridge.send('setFooterVisible', { visible });
}

/** Update the active tab highlight on the native iOS footer bar. */
export function setNativeFooterActiveTab(tab: string | null): void {
  void bridge.send('setFooterVisible', { visible: true, activeTab: tab });
}

export type ChatComposerAction = 'show' | 'hide' | 'running' | 'disabled';

export function postChatComposer(action: ChatComposerAction, value?: boolean): void {
  void bridge.send('postChatComposer', { action, value });
}

export type ChapterPullDirection = 'next' | 'prev' | 'reset';

export function postChapterPull(data: {
  direction: ChapterPullDirection;
  progress?: number;
  committed?: boolean;
}): void {
  void bridge.send('postChapterPull', data);
}
