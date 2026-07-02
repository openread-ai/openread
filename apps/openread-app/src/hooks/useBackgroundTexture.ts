import { useCallback } from 'react';
import { useCustomTextureStore } from '@/store/customTextureStore';
import { EnvConfigType } from '@/services/environment';
import { ViewSettings } from '@/types/book';

export const useBackgroundTexture = () => {
  const applyBackgroundTexture = useCallback(
    (envConfig: EnvConfigType, viewSettings: ViewSettings) => {
      const textureId = viewSettings.backgroundTextureId;
      const textureOpacity = viewSettings.backgroundOpacity;
      const textureSize = viewSettings.backgroundSize;

      useCustomTextureStore.getState().applyTexture(envConfig, textureId || 'none', {
        opacity: textureOpacity,
        size: textureSize,
      });
    },
    [],
  );

  return { applyBackgroundTexture };
};
