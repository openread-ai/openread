import {
  bridgeCan,
  type BridgeCapability,
  type BridgeCommandMap,
  type BridgeCommandName,
  type BridgeCommandResultMap,
  type BridgeEventMap,
  type BridgeEventName,
} from '@openread/bridge';
import { getBridgePlatform } from './platform';
import { postIOSMessage, hasIOSMessageHandler } from './adapters/iosBridge';
import {
  runNativeBridgeCommand,
  runTauriCommand,
  type TauriCommandArgs,
} from './adapters/tauriBridge';
import { runWebNoop } from './adapters/webBridge';

type AsyncBridgeListener<K extends BridgeEventName> = (
  event: BridgeEventMap[K],
) => void | Promise<void>;
type SyncBridgeListener<K extends BridgeEventName> = (event: BridgeEventMap[K]) => boolean;

class BridgeService {
  private asyncListeners = new Map<BridgeEventName, Set<AsyncBridgeListener<BridgeEventName>>>();
  private syncListeners = new Map<BridgeEventName, Array<SyncBridgeListener<BridgeEventName>>>();

  get platform() {
    return getBridgePlatform();
  }

  can(capability: BridgeCapability): boolean;
  can(command: BridgeCommandName): boolean;
  can(value: BridgeCapability | BridgeCommandName): boolean {
    if (isCapability(value)) return bridgeCan(this.platform, value);
    if (this.platform === 'ios') return commandSupportedOnIOS(value);
    if (this.platform === 'android') return commandSupportedOnAndroid(value);
    if (this.platform === 'tauri-desktop') return commandSupportedOnDesktop(value);
    return commandSupportedOnWeb(value);
  }

  async send<K extends BridgeCommandName>(
    command: K,
    payload: BridgeCommandMap[K],
  ): Promise<BridgeCommandResultMap[K]> {
    return dispatchBridgeCommand(command, payload) as Promise<BridgeCommandResultMap[K]>;
  }

  on<K extends BridgeEventName>(event: K, listener: AsyncBridgeListener<K>): () => void {
    const listeners = this.asyncListeners.get(event) ?? new Set();
    listeners.add(listener as AsyncBridgeListener<BridgeEventName>);
    this.asyncListeners.set(event, listeners);
    return () => this.off(event, listener);
  }

  off<K extends BridgeEventName>(event: K, listener: AsyncBridgeListener<K>): void {
    this.asyncListeners.get(event)?.delete(listener as AsyncBridgeListener<BridgeEventName>);
  }

  onSync<K extends BridgeEventName>(event: K, listener: SyncBridgeListener<K>): () => void {
    const listeners = this.syncListeners.get(event) ?? [];
    listeners.push(listener as SyncBridgeListener<BridgeEventName>);
    this.syncListeners.set(event, listeners);
    return () => this.offSync(event, listener);
  }

  offSync<K extends BridgeEventName>(event: K, listener: SyncBridgeListener<K>): void {
    const listeners = this.syncListeners.get(event);
    if (!listeners) return;
    this.syncListeners.set(
      event,
      listeners.filter((item) => item !== (listener as SyncBridgeListener<BridgeEventName>)),
    );
  }

  async emit<K extends BridgeEventName>(event: K, payload: BridgeEventMap[K]): Promise<void> {
    const listeners = this.asyncListeners.get(event);
    if (!listeners) return;
    for (const listener of listeners) {
      await listener(payload);
    }
  }

  emitSync<K extends BridgeEventName>(event: K, payload: BridgeEventMap[K]): boolean {
    const listeners = this.syncListeners.get(event);
    if (!listeners) return false;
    for (const listener of [...listeners].reverse()) {
      if (listener(payload)) return true;
    }
    return false;
  }
}

export const bridge = new BridgeService();

export async function runNativeCommand<T = unknown>(
  command: string,
  args?: TauriCommandArgs,
): Promise<T> {
  return runTauriCommand<T>(command, args);
}

export async function runNativeBridge<T = unknown>(command: string, payload?: unknown): Promise<T> {
  return runNativeBridgeCommand<T>(command, payload);
}

async function dispatchBridgeCommand<K extends BridgeCommandName>(
  command: K,
  payload: BridgeCommandMap[K],
): Promise<unknown> {
  switch (command) {
    case 'setToolbarVisible':
      postIOSMessage('openreadToolbarVisible', payload);
      return;
    case 'setSidebarVisible':
      postIOSMessage('openreadSidebarVisible', payload);
      return;
    case 'setFooterVisible':
      postIOSMessage('openreadFooterVisible', payload);
      return;
    case 'setSelectionToolbarVisible':
      postIOSMessage('openreadSelectionToolbar', payload);
      return;
    case 'openColorPicker':
      postIOSMessage('openreadColorPicker', payload);
      return;
    case 'hideColorPicker':
      postIOSMessage('openreadColorPickerHide', payload);
      return;
    case 'openTextInput':
      postIOSMessage('openreadTextInput', payload);
      return;
    case 'postChatComposer':
      postIOSMessage('openreadChatComposer', payload);
      return;
    case 'postChapterPull':
      postIOSMessage('openreadChapterPull', payload);
      return;
    case 'setCollectionToolbarVisible':
      postIOSMessage('openreadCollectionToolbar', payload);
      return;
    case 'openCollectionPicker':
      postIOSMessage('openreadCollectionPicker', payload);
      return;
    case 'openRenameBook':
      postIOSMessage('openreadRenameBook', payload);
      return;
    case 'setTextInputFocused':
      runWebNoop();
      return;
    case 'setNativeDragRegion':
      await runTauriCommand('set_native_drag_region', payload);
      return;
    case 'setTrafficLights':
      await runTauriCommand('set_traffic_lights', payload);
      return;
    case 'interceptKeys':
      await runNativeBridgeCommand('intercept_keys', payload);
      return;
    case 'lockScreenOrientation':
      await runNativeBridgeCommand('lock_screen_orientation', payload);
      return;
    case 'useBackgroundAudio':
      await runNativeBridgeCommand('use_background_audio', payload);
      return;
    case 'setSystemUIVisibility':
      return runNativeBridgeCommand('set_system_ui_visibility', payload);
    case 'setScreenBrightness':
      return runNativeBridgeCommand('set_screen_brightness', payload);
    case 'copyURIToPath':
      return runNativeBridgeCommand('copy_uri_to_path', payload);
    case 'installPackage':
      return runNativeBridgeCommand('install_package', payload);
    case 'getStatusBarHeight':
      return runNativeBridgeCommand('get_status_bar_height');
    case 'getSysFontsList':
      return runNativeBridgeCommand('get_sys_fonts_list');
    case 'getSystemColorScheme':
      return runNativeBridgeCommand('get_system_color_scheme');
    case 'getSafeAreaInsets':
      return runNativeBridgeCommand('get_safe_area_insets');
    case 'getScreenBrightness':
      return runNativeBridgeCommand('get_screen_brightness');
    case 'getExternalSDCardPath':
      return runNativeBridgeCommand('get_external_sdcard_path');
    case 'selectDirectory':
      return runNativeBridgeCommand('select_directory');
    case 'getStorefrontRegionCode':
      return runNativeBridgeCommand('get_storefront_region_code');
    default:
      runWebNoop();
      return;
  }
}

function isCapability(value: BridgeCapability | BridgeCommandName): value is BridgeCapability {
  return [
    'nativeCommands',
    'nativeCallbacks',
    'wkMessageHandlers',
    'androidCallbacks',
    'tauriCommands',
    'nativeTextSelection',
    'nativeFooter',
    'nativeToolbar',
    'nativeCollections',
    'nativeTts',
    'iap',
    'screenControls',
    'fileTransfer',
  ].includes(value);
}

function commandSupportedOnIOS(command: BridgeCommandName): boolean {
  if (command === 'setToolbarVisible') return hasIOSMessageHandler('openreadToolbarVisible');
  if (command === 'setSidebarVisible') return hasIOSMessageHandler('openreadSidebarVisible');
  if (command === 'setFooterVisible') return hasIOSMessageHandler('openreadFooterVisible');
  if (command === 'setSelectionToolbarVisible')
    return hasIOSMessageHandler('openreadSelectionToolbar');
  if (command === 'openColorPicker') return hasIOSMessageHandler('openreadColorPicker');
  if (command === 'openTextInput') return hasIOSMessageHandler('openreadTextInput');
  return true;
}

function commandSupportedOnAndroid(command: BridgeCommandName): boolean {
  return ![
    'setToolbarVisible',
    'setSidebarVisible',
    'setFooterVisible',
    'setSelectionToolbarVisible',
    'openColorPicker',
    'hideColorPicker',
    'openTextInput',
    'postChatComposer',
    'postChapterPull',
    'setCollectionToolbarVisible',
    'openCollectionPicker',
    'openRenameBook',
  ].includes(command);
}

function commandSupportedOnDesktop(command: BridgeCommandName): boolean {
  return ![
    'setToolbarVisible',
    'setSidebarVisible',
    'setFooterVisible',
    'setSelectionToolbarVisible',
    'openColorPicker',
    'hideColorPicker',
    'openTextInput',
    'postChatComposer',
    'postChapterPull',
    'setCollectionToolbarVisible',
    'openCollectionPicker',
    'openRenameBook',
  ].includes(command);
}

function commandSupportedOnWeb(command: BridgeCommandName): boolean {
  return command === 'setTextInputFocused';
}
