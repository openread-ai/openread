'use client';

import { useEffect, type RefObject } from 'react';

interface DismissableLayerOptions {
  enabled: boolean;
  layerRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
}

export const useDismissableLayer = ({ enabled, layerRef, onDismiss }: DismissableLayerOptions) => {
  useEffect(() => {
    if (!enabled) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (layerRef.current?.contains(target)) return;
      onDismiss();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled, layerRef, onDismiss]);
};
