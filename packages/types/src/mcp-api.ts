export interface McpAuthRequest {
  token: string;
}

export interface McpAuthResponse {
  jwt: string;
  userId: string;
  expiresAt: number;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface McpDownloadUrlRequest {
  bookId: string;
}

export interface McpDownloadUrlResponse {
  url: string;
  expiresAt: number;
  sizeBytes: number | null;
  format: string;
}
