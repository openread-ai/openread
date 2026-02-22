export interface DBBook {
  user_id: string;
  book_hash: string;
  meta_hash?: string;
  format: string;
  title: string;
  source_title?: string;
  author: string;
  group_id?: string;
  group_name?: string;
  tags?: string[];
  progress?: [number, number];
  reading_status?: string;

  metadata?: Record<string, unknown> | null;
  sync_version?: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  uploaded_at?: string | null;
}

export interface DBBookConfig {
  user_id: string;
  book_hash: string;
  meta_hash?: string;
  location?: string;
  xpointer?: string;
  progress?: [number, number] | null;
  search_config?: Record<string, unknown> | null;
  view_settings?: Record<string, unknown> | null;

  sync_version?: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface DBBookNote {
  user_id: string;
  book_hash: string;
  meta_hash?: string;
  id: string;
  type: string;
  cfi: string;
  text?: string;
  style?: string;
  color?: string;
  note: string;

  sync_version?: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}
