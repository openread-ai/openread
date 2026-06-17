import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SAMPLE_BOOK_ID, SAMPLE_BOOK_ATTEMPTED_KEY, importSampleBook } from '@/lib/sample-book';

// Mock the logger
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const { mockImportBook } = vi.hoisted(() => ({ mockImportBook: vi.fn() }));

vi.mock('@/services/platform/client', () => ({
  platform: {
    catalog: {
      importBook: (...args: unknown[]) => mockImportBook(...args),
    },
  },
}));

describe('sample-book constants', () => {
  it('should export a SAMPLE_BOOK_ID constant', () => {
    expect(SAMPLE_BOOK_ID).toBe('alice-in-wonderland');
  });

  it('should export a SAMPLE_BOOK_ATTEMPTED_KEY constant', () => {
    expect(SAMPLE_BOOK_ATTEMPTED_KEY).toBe('sample_book_attempted');
  });

  it('SAMPLE_BOOK_ID should be a non-empty string (easy to change)', () => {
    expect(typeof SAMPLE_BOOK_ID).toBe('string');
    expect(SAMPLE_BOOK_ID.length).toBeGreaterThan(0);
  });
});

describe('importSampleBook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockImportBook.mockResolvedValue({ status: 'ready', book_id: '123' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should mark as attempted in localStorage immediately', async () => {
    await importSampleBook('test-token');
    expect(localStorage.getItem(SAMPLE_BOOK_ATTEMPTED_KEY)).not.toBeNull();
  });

  it('should return true when import is immediately ready', async () => {
    mockImportBook.mockResolvedValue({ status: 'ready', book_id: '123', book_hash: 'abc' });

    const result = await importSampleBook('test-token');
    expect(result).toBe(true);
  });

  it('should call the typed catalog client', async () => {
    await importSampleBook('my-jwt-token');

    expect(mockImportBook).toHaveBeenCalledWith(SAMPLE_BOOK_ID);
  });

  it('should return false when API import fails', async () => {
    mockImportBook.mockRejectedValue(new Error('Not Found'));

    const result = await importSampleBook('test-token');
    expect(result).toBe(false);
  });

  it('should still mark as attempted even on API failure', async () => {
    mockImportBook.mockRejectedValue(new Error('Server Error'));

    await importSampleBook('test-token');
    expect(localStorage.getItem(SAMPLE_BOOK_ATTEMPTED_KEY)).not.toBeNull();
  });

  it('should return false when book status is preparing (no polling)', async () => {
    mockImportBook.mockResolvedValue({ status: 'preparing' });

    const result = await importSampleBook('test-token');
    expect(result).toBe(false);
  });

  it('should return false and not throw on network error', async () => {
    mockImportBook.mockRejectedValue(new Error('Network error'));

    const result = await importSampleBook('test-token');
    expect(result).toBe(false);
  });

  it('should still mark as attempted on network error', async () => {
    mockImportBook.mockRejectedValue(new Error('Network error'));

    await importSampleBook('test-token');
    expect(localStorage.getItem(SAMPLE_BOOK_ATTEMPTED_KEY)).not.toBeNull();
  });
});
