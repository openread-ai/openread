import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upsertPlatformBook, deletePlatformBook } from '../../utils/platformBooks';

// Mock the supabase module
vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { createSupabaseAdminClient } from '@/utils/supabase';

describe('platformBooks', () => {
  const mockUpsert = vi.fn();
  const mockDelete = vi.fn();
  const mockEqSecond = vi.fn(); // Second eq in chain (returns the final result)
  const mockEqFirst = vi.fn(); // First eq in chain (returns object with second eq)
  const mockFrom = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock chain for delete: .delete().eq('book_hash', hash).eq('user_id', userId)
    mockEqSecond.mockResolvedValue({ error: null });
    mockEqFirst.mockReturnValue({ eq: mockEqSecond });
    mockDelete.mockReturnValue({ eq: mockEqFirst });

    // Setup from mock
    mockFrom.mockReturnValue({
      upsert: mockUpsert,
      delete: mockDelete,
    });

    (createSupabaseAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: mockFrom,
    });
  });

  describe('upsertPlatformBook', () => {
    const validInput = {
      hash: 'hash-abc',
      metaHash: 'meta-xyz',
      title: 'Test Book',
      author: 'Test Author',
      format: 'epub',
      sizeBytes: 1024,
      storagePath: 'user-123/books/test.epub',
      userId: 'user-123',
    };

    it('should return success: true when upsert succeeds', async () => {
      mockUpsert.mockResolvedValue({ data: { id: 'new-id' }, error: null });

      const result = await upsertPlatformBook(validInput);

      expect(result).toEqual({ success: true });
      expect(mockFrom).toHaveBeenCalledWith('books');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          book_hash: 'hash-abc',
          meta_hash: 'meta-xyz',
          title: 'Test Book',
          author: 'Test Author',
          format: 'epub', // lowercase
          size_bytes: 1024,
          storage_path: 'user-123/books/test.epub',
          user_id: 'user-123',
        }),
        { onConflict: 'book_hash,user_id' },
      );
    });

    it('should return success: false with error message when upsert fails', async () => {
      const errorMessage = 'Database connection failed';
      mockUpsert.mockResolvedValue({ data: null, error: { message: errorMessage } });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await upsertPlatformBook(validInput);

      expect(result).toEqual({ success: false, error: errorMessage });
      expect(consoleSpy).toHaveBeenCalledWith('[upsertPlatformBook] Failed:', errorMessage);

      consoleSpy.mockRestore();
    });

    it('should convert format to lowercase', async () => {
      mockUpsert.mockResolvedValue({ data: { id: 'new-id' }, error: null });

      await upsertPlatformBook({ ...validInput, format: 'pdf' });

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'pdf' }),
        expect.anything(),
      );
    });

    it('should handle empty author by converting to null', async () => {
      mockUpsert.mockResolvedValue({ data: { id: 'new-id' }, error: null });

      await upsertPlatformBook({ ...validInput, author: '' });

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ author: null }),
        expect.anything(),
      );
    });
  });

  describe('deletePlatformBook', () => {
    it('should return success: true when delete succeeds', async () => {
      mockEqSecond.mockResolvedValue({ error: null });

      const result = await deletePlatformBook('hash-abc', 'user-123');

      expect(result).toEqual({ success: true });
      expect(mockFrom).toHaveBeenCalledWith('books');
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should return success: false with error message when delete fails', async () => {
      const errorMessage = 'Delete operation failed';
      mockEqSecond.mockResolvedValue({ error: { message: errorMessage } });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await deletePlatformBook('hash-abc', 'user-123');

      expect(result).toEqual({ success: false, error: errorMessage });
      expect(consoleSpy).toHaveBeenCalledWith('[deletePlatformBook] Failed:', errorMessage);

      consoleSpy.mockRestore();
    });

    it('should filter by both hash and user_id', async () => {
      mockEqSecond.mockResolvedValue({ error: null });

      await deletePlatformBook('hash-xyz', 'user-456');

      expect(mockDelete).toHaveBeenCalled();
      // The eq chain is called: .eq('book_hash', hash).eq('user_id', userId)
      expect(mockEqFirst).toHaveBeenCalledWith('book_hash', 'hash-xyz');
      expect(mockEqSecond).toHaveBeenCalledWith('user_id', 'user-456');
    });
  });
});
