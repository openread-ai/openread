'use client';

import { useEffect } from 'react';
import { registerNativeCallbacks } from '@/services/bridge/nativeCallbacks';

export function NativeBridgeRegistrar() {
  useEffect(() => {
    registerNativeCallbacks();
  }, []);

  return null;
}
