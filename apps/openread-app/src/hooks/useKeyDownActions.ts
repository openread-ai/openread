import { RefObject, useEffect, useRef } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useDeviceControlStore } from '@/store/deviceStore';
import { bridge } from '@/services/bridge/bridgeService';

interface UseKeyDownOptions {
  onCancel?: () => void;
  onConfirm?: () => void;
  enabled?: boolean;
  elementRef?: RefObject<HTMLElement | null>;
}

export const useKeyDownActions = ({
  onCancel,
  onConfirm,
  enabled = true,
  elementRef: providedRef,
}: UseKeyDownOptions) => {
  const { appService } = useEnv();
  const { acquireBackKeyInterception, releaseBackKeyInterception } = useDeviceControlStore();
  const internalRef = useRef<HTMLDivElement | null>(null);
  const elementRef = providedRef || internalRef;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel?.();
      } else if (event.key === 'Enter') {
        onConfirm?.();
      }
      event.stopPropagation();
      return false;
    };

    const handleNativeKeyDown = (event: { keyName: string }) => {
      if (event.keyName === 'Back') {
        onCancel?.();
        return true;
      }
      return false;
    };

    window.addEventListener('keydown', handleKeyDown);

    if (elementRef.current) {
      elementRef.current.addEventListener('keydown', handleKeyDown);
    }

    if (appService?.isAndroidApp) {
      acquireBackKeyInterception?.();
      bridge.onSync('nativeKeyDown', handleNativeKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);

      if (appService?.isAndroidApp) {
        releaseBackKeyInterception?.();
        bridge.offSync('nativeKeyDown', handleNativeKeyDown);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, appService?.isAndroidApp]);

  return internalRef;
};
