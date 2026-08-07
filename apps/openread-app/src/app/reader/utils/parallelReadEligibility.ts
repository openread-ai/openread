import { Book, FIXED_LAYOUT_FORMATS } from '@/types/book';
import { hasAnyOpenableSource } from '@/utils/book';

export const PARALLEL_READ_MENU_LIMIT = 20;

export function canOfferBookForParallelRead(
  book: Pick<Book, 'format' | 'downloadedAt' | 'storagePath' | 'uploadedAt' | 'url'>,
) {
  return !FIXED_LAYOUT_FORMATS.has(book.format) && hasAnyOpenableSource(book);
}

export function getParallelReadMenuBooks(books: Book[], activeBookId?: string) {
  return books
    .filter(canOfferBookForParallelRead)
    .filter((book) => book.hash !== activeBookId)
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
    .slice(0, PARALLEL_READ_MENU_LIMIT);
}
