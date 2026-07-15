'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useLibrary } from '@/hooks/useLibrary';

type LibraryLifecycleState = ReturnType<typeof useLibrary>;

const LibraryLifecycleContext = createContext<LibraryLifecycleState | null>(null);

export function LibraryLifecycleProvider({ children }: { children: ReactNode }) {
  const lifecycle = useLibrary();

  return (
    <LibraryLifecycleContext.Provider value={lifecycle}>
      {children}
    </LibraryLifecycleContext.Provider>
  );
}

export function useLibraryLifecycle(): LibraryLifecycleState {
  const lifecycle = useContext(LibraryLifecycleContext);
  if (!lifecycle) {
    throw new Error('useLibraryLifecycle must be used within LibraryLifecycleProvider');
  }
  return lifecycle;
}
