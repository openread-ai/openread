import type {
  CatalogBook,
  CatalogBookDetail,
  CatalogBrowseResponse,
  CatalogCollection,
  CatalogImportIntentMode,
  CatalogImportResponse,
  CatalogStatusResponse,
  CollectionWithBooks,
} from '@openread/types';

/** Import lifecycle states. */
export type ImportStatus = 'idle' | 'importing' | 'ready' | 'error';
export type ImportPhase =
  | 'requesting_intent'
  | 'downloading'
  | 'validating'
  | 'importing'
  | 'opening';

export interface ImportState {
  status: ImportStatus;
  progress?: number;
  mode?: CatalogImportIntentMode;
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
