import type { Book } from '@/types/book';

export type BookAvailability =
  | { state: 'present'; book: Book }
  | { state: 'absent'; book: null }
  | { state: 'unknown'; book: null };

export function resolveBookAvailability(input: {
  bookHash: string | undefined;
  catalogBookId?: string;
  library: readonly Book[];
  libraryLoaded: boolean;
  libraryReconciliationSettled: boolean;
}): BookAvailability {
  if (!input.libraryLoaded) return { state: 'unknown', book: null };

  const book = input.bookHash
    ? input.library.find(
        (candidate) =>
          !candidate.deletedAt &&
          candidate.hash === input.bookHash &&
          (input.catalogBookId === undefined || candidate.catalogBookId === input.catalogBookId),
      )
    : undefined;

  if (book) return { state: 'present', book };
  if (!input.libraryReconciliationSettled) return { state: 'unknown', book: null };
  return { state: 'absent', book: null };
}
