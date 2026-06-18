export interface PlatformApiKeySummary {
  id: string;
  description: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ListPlatformApiKeysResponse {
  keys: PlatformApiKeySummary[];
}

export interface CreatePlatformApiKeyRequest {
  description: string;
}

export interface CreatePlatformApiKeyResponse {
  key: string;
  id: string;
}

export interface DeletePlatformApiKeyResponse {
  success: true;
}

export interface ProviderApiKeySummary {
  provider: string;
  keyPrefix: string;
  isValid: boolean | null;
  lastTestedAt: string | null;
}

export type ListProviderApiKeysResponse = ProviderApiKeySummary[];

export interface UpsertProviderApiKeyRequest {
  provider: string;
  apiKey: string;
}

export interface UpsertProviderApiKeyResponse {
  provider: string;
  keyPrefix: string;
  isValid: boolean | null;
}

export interface DeleteProviderApiKeyResponse {
  success: true;
}

export interface TestProviderApiKeyRequest {
  provider: string;
}

export interface TestProviderApiKeyResponse {
  isValid: boolean;
  error?: string;
}
