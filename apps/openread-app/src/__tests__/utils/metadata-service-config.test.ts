import { describe, expect, it } from 'vitest';
import { MetadataService } from '@/services/metadata/service';

const API_KEY = 'test-google-books-api-key-123456789';

describe('MetadataService Google Books configuration', () => {
  it('keeps Open Library available when the optional key is missing', () => {
    const service = new MetadataService();

    expect(service.getProviders()).toEqual(['openlibrary']);
  });

  it('enables Google Books with one valid key', () => {
    const service = new MetadataService({ googleBooksApiKey: API_KEY });

    expect(service.getProviders()).toEqual(['openlibrary', 'googlebooks']);
  });

  it('fails closed on invalid Google Books configuration', () => {
    expect(() => new MetadataService({ googleBooksApiKey: `${API_KEY},${API_KEY}` })).toThrow(
      'Invalid Google Books API key configuration',
    );
  });
});
