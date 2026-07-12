import type {
  CatalogBook,
  CatalogBookDetail,
  CatalogBrowseResponse,
  CatalogCollection,
  CatalogImportResponse,
  CatalogStatusResponse,
  CollectionWithBooks,
} from '@openread/types';

/** Import lifecycle states. */
export type ImportStatus = 'idle' | 'importing' | 'ready' | 'error';
export type ImportPhase = 'requesting_add' | 'materializing' | 'syncing' | 'opening';

export interface ImportState {
  status: ImportStatus;
  progress?: number;
  phase?: ImportPhase;
  statusMessage?: string;
  bookId?: string;
  bookHash?: string;
  downloadUrl?: string;
  error?: string;
}

export type {
  CatalogBook,
  CatalogBookDetail,
  CatalogBrowseResponse,
  CatalogCollection,
  CatalogImportResponse as ImportApiResponse,
  CatalogStatusResponse as StatusApiResponse,
  CollectionWithBooks,
};
