import { bridge } from '@/services/bridge/bridgeService';

export interface CopyURIRequest {
  uri: string;
  dst: string;
}

export interface CopyURIResponse {
  success: boolean;
  error?: string;
}

export interface UseBackgroundAudioRequest {
  enabled: boolean;
}

export interface InstallPackageRequest {
  path: string;
}

export interface InstallPackageResponse {
  success: boolean;
  error?: string;
}

export interface SetSystemUIVisibilityRequest {
  visible: boolean;
  darkMode: boolean;
  /** Resolved DaisyUI `base-100` hex — native WebView uses this under translucent system UI (e.g. keyboard). */
  surfaceColorHex?: string;
}

export interface SetSystemUIVisibilityResponse {
  success: boolean;
  error?: string;
}

export interface GetStatusBarHeightResponse {
  height: number;
  error?: string;
}

export interface GetSystemFontsListResponse {
  fonts: Record<string, string>; // { fontName: fontFamily }
  error?: string;
}

export interface InterceptKeysRequest {
  volumeKeys?: boolean;
  backKey?: boolean;
}

export interface LockScreenRequest {
  orientation: 'portrait' | 'landscape' | 'auto';
}

export interface GetSystemColorSchemeResponse {
  colorScheme: 'light' | 'dark';
  error?: string;
}

export interface GetSafeAreaInsetsResponse {
  top: number;
  right: number;
  bottom: number;
  left: number;
  error?: string;
}

interface GetScreenBrightnessResponse {
  brightness: number; // 0.0 to 1.0
  error?: string;
}

interface SetScreenBrightnessRequest {
  brightness: number; // 0.0 to 1.0
}

interface SetScreenBrightnessResponse {
  success: boolean;
  error?: string;
}

interface GetExternalSDCardPathResponse {
  path: string | null;
  error?: string;
}

interface SelectDirectoryResponse {
  cancelled?: boolean;
  uri?: string;
  path?: string;
  error?: string;
}

export interface GetStorefrontRegionCodeResponse {
  regionCode?: string;
  error?: string;
}

export async function copyURIToPath(request: CopyURIRequest): Promise<CopyURIResponse> {
  return bridge.send('copyURIToPath', request);
}

export async function invokeUseBackgroundAudio(request: UseBackgroundAudioRequest): Promise<void> {
  await bridge.send('useBackgroundAudio', request);
}

export async function installPackage(
  request: InstallPackageRequest,
): Promise<InstallPackageResponse> {
  return bridge.send('installPackage', request);
}

export async function setSystemUIVisibility(
  request: SetSystemUIVisibilityRequest,
): Promise<SetSystemUIVisibilityResponse> {
  return bridge.send('setSystemUIVisibility', request);
}

export async function getStatusBarHeight(): Promise<GetStatusBarHeightResponse> {
  return bridge.send('getStatusBarHeight', {});
}

let cachedSysFontsResult: GetSystemFontsListResponse | null = null;

export async function getSysFontsList(): Promise<GetSystemFontsListResponse> {
  if (cachedSysFontsResult) {
    return cachedSysFontsResult;
  }
  const result = await bridge.send('getSysFontsList', {});
  cachedSysFontsResult = result;
  return result;
}

export async function interceptKeys(request: InterceptKeysRequest): Promise<void> {
  await bridge.send('interceptKeys', request);
}

export async function lockScreenOrientation(request: LockScreenRequest): Promise<void> {
  await bridge.send('lockScreenOrientation', request);
}

export async function getSystemColorScheme(): Promise<GetSystemColorSchemeResponse> {
  return bridge.send('getSystemColorScheme', {});
}

export async function getSafeAreaInsets(): Promise<GetSafeAreaInsetsResponse> {
  return bridge.send('getSafeAreaInsets', {});
}

export async function getScreenBrightness(): Promise<GetScreenBrightnessResponse> {
  return bridge.send('getScreenBrightness', {});
}

export async function setScreenBrightness(
  request: SetScreenBrightnessRequest,
): Promise<SetScreenBrightnessResponse> {
  return bridge.send('setScreenBrightness', request);
}

export async function getExternalSDCardPath(): Promise<GetExternalSDCardPathResponse> {
  return bridge.send('getExternalSDCardPath', {});
}

export async function selectDirectory(): Promise<SelectDirectoryResponse> {
  return bridge.send('selectDirectory', {});
}

export async function getStorefrontRegionCode(): Promise<GetStorefrontRegionCodeResponse> {
  return bridge.send('getStorefrontRegionCode', {});
}
