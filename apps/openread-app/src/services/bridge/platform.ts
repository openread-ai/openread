import type { BridgePlatform } from '@openread/bridge';
import { isMobileWebPlatform, isTauriAppPlatform } from '@/services/environment';

export function getBridgePlatform(): BridgePlatform {
  if (!isTauriAppPlatform()) {
    return isMobileWebPlatform() ? 'mobile-web' : 'web';
  }

  const os = getTauriOsType();
  if (os === 'ios') return 'ios';
  if (os === 'android') return 'android';
  return 'tauri-desktop';
}

function getTauriOsType(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { type: osType } = require('@tauri-apps/plugin-os') as { type: () => string };
    return osType();
  } catch {
    return null;
  }
}
