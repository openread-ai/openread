import { describe, it, expect, vi } from 'vitest';
import {
  parseAuthors,
  createBookGroups,
  createBookSorter,
  createWithinGroupSorter,
  getBookSortValue,
  getGroupSortValue,
  compareSortValues,
  createGroupSorter,
  ensureLibrarySortByType,
  ensureLibraryGroupByType,
  findGroupById,
  getGroupDisplayName,
} from '@/app/(platform)/library/utils/libraryUtils';
import type { Book, BooksGroup } from '@/types/book';

// Mock md5Fingerprint
vi.mock('@/utils/md5', () => ({
  md5Fingerprint: (input: string) => `md5_${input}`,
}));

// Mock formatTitle and formatAuthors
vi.mock('@/utils/book', () => ({
  formatTitle: (title: string | { toString(): string }) => String(title),
  formatAuthors: (
    author: string | string[] | { name?: string } | { name?: string }[],
    _lang?: string,
    _sortAs?: boolean,
  ) => {
    if (typeof author === 'string') return author;
    if (Array.isArray(author)) {
      return author
        .map((a) => (typeof a === 'string' ? a : a?.name || ''))
        .filter(Boolean)
        .join(', ');
    }
    return (author as { name?: string })?.name || '';
  },
}));

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    hash: `hash_${Math.random().toString(36).slice(2)}`,
    format: 'epub',
    title: 'Test Book',
    author: 'Test Author',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('parseAuthors', () => {
  it('should return empty array for empty string', () => {
    expect(parseAuthors('')).toEqual([]);
    expect(parseAuthors('  ')).toEqual([]);
  });

  it('should parse single author', () => {
    expect(parseAuthors('John Doe')).toEqual(['John Doe']);
  });

  it('should split by comma', () => {
    expect(parseAuthors('Author A, Author B')).toEqual(['Author A', 'Author B']);
  });

  it('should split by ampersand', () => {
    expect(parseAuthors('Author A & Author B')).toEqual(['Author A', 'Author B']);
  });

  it('should split by "and"', () => {
    expect(parseAuthors('Author A and Author B')).toEqual(['Author A', 'Author B']);
  });

  it('should handle mixed separators', () => {
    expect(parseAuthors('Author A, Author B & Author C')).toEqual([
      'Author A',
      'Author B',
      'Author C',
    ]);
  });
});

describe('ensureLibrarySortByType', () => {
  it('should return valid sort type', () => {
    expect(ensureLibrarySortByType('title', 'updated')).toBe('title');
    expect(ensureLibrarySortByType('author', 'updated')).toBe('author');
  });

  it('should return fallback for invalid value', () => {
    expect(ensureLibrarySortByType('invalid', 'updated')).toBe('updated');
    expect(ensureLibrarySortByType(null, 'updated')).toBe('updated');
    expect(ensureLibrarySortByType(undefined, 'updated')).toBe('updated');
  });
});

describe('ensureLibraryGroupByType', () => {
  it('should return valid group type', () => {
    expect(ensureLibraryGroupByType('series', 'manual')).toBe('series');
    expect(ensureLibraryGroupByType('author', 'manual')).toBe('author');
  });

  it('should return fallback for invalid value', () => {
    expect(ensureLibraryGroupByType('invalid', 'manual')).toBe('manual');
    expect(ensureLibraryGroupByType(null, 'manual')).toBe('manual');
  });
});

describe('createBookGroups', () => {
  it('should return all books for "none" grouping', () => {
    const books = [makeBook({ title: 'Book A' }), makeBook({ title: 'Book B' })];
    const result = createBookGroups(books, 'none');
    expect(result).toHaveLength(2);
    expect(result.every((item) => !('books' in item))).toBe(true);
  });

  it('should filter out deleted books', () => {
    const books = [
      makeBook({ title: 'Active Book' }),
      makeBook({ title: 'Deleted Book', deletedAt: Date.now() }),
    ];
    const result = createBookGroups(books, 'none');
    expect(result).toHaveLength(1);
  });

  it('should group by series', () => {
    const books = [
      makeBook({ title: 'Book 1', metadata: { series: 'My Series' } as never }),
      makeBook({ title: 'Book 2', metadata: { series: 'My Series' } as never }),
      makeBook({ title: 'Standalone' }),
    ];
    const result = createBookGroups(books, 'series');

    const groups = result.filter((item): item is BooksGroup => 'books' in item);
    const ungrouped = result.filter((item) => !('books' in item));

    expect(groups).toHaveLength(1);
    expect(groups[0]!.books).toHaveLength(2);
    expect(groups[0]!.name).toBe('My Series');
    expect(ungrouped).toHaveLength(1);
  });

  it('should group by author', () => {
    const books = [
      makeBook({ title: 'Book A', author: 'Author One' }),
      makeBook({ title: 'Book B', author: 'Author One' }),
      makeBook({ title: 'Book C', author: 'Author Two' }),
    ];
    const result = createBookGroups(books, 'author');

    const groups = result.filter((item): item is BooksGroup => 'books' in item);
    expect(groups).toHaveLength(2);
  });

  it('should handle books with multiple authors in author grouping', () => {
    const books = [
      makeBook({ title: 'Collab Book', author: 'Author A, Author B' }),
      makeBook({ title: 'Solo Book', author: 'Author A' }),
    ];
    const result = createBookGroups(books, 'author');

    const groups = result.filter((item): item is BooksGroup => 'books' in item);
    const authorAGroup = groups.find((g) => g.name === 'Author A');
    const authorBGroup = groups.find((g) => g.name === 'Author B');

    expect(authorAGroup).toBeDefined();
    expect(authorAGroup!.books).toHaveLength(2);
    expect(authorBGroup).toBeDefined();
    expect(authorBGroup!.books).toHaveLength(1);
  });

  it('should put books without author in ungrouped for author grouping', () => {
    const books = [makeBook({ title: 'No Author', author: '' }), makeBook({ author: 'Author A' })];
    const result = createBookGroups(books, 'author');

    const ungrouped = result.filter((item) => !('books' in item));
    expect(ungrouped).toHaveLength(1);
  });
});

describe('createBookSorter', () => {
  it('should sort by title', () => {
    const books = [makeBook({ title: 'Zebra' }), makeBook({ title: 'Apple' })];
    books.sort(createBookSorter('title', 'en'));
    expect(books[0]!.title).toBe('Apple');
    expect(books[1]!.title).toBe('Zebra');
  });

  it('should sort by updated date', () => {
    const books = [makeBook({ updatedAt: 2000 }), makeBook({ updatedAt: 1000 })];
    books.sort(createBookSorter('updated', 'en'));
    expect(books[0]!.updatedAt).toBe(1000);
    expect(books[1]!.updatedAt).toBe(2000);
  });

  it('should sort by created date', () => {
    const books = [makeBook({ createdAt: 3000 }), makeBook({ createdAt: 1000 })];
    books.sort(createBookSorter('created', 'en'));
    expect(books[0]!.createdAt).toBe(1000);
    expect(books[1]!.createdAt).toBe(3000);
  });
});

describe('createWithinGroupSorter', () => {
  it('should sort by series index for series groups', () => {
    const books = [
      makeBook({
        title: 'Book 3',
        metadata: { series: 'Series', seriesIndex: 3 } as never,
      }),
      makeBook({
        title: 'Book 1',
        metadata: { series: 'Series', seriesIndex: 1 } as never,
      }),
    ];
    books.sort(createWithinGroupSorter('series', 'updated', 'en'));
    expect(books[0]!.title).toBe('Book 1');
    expect(books[1]!.title).toBe('Book 3');
  });

  it('should fall back to sort setting when no series index', () => {
    const books = [
      makeBook({ title: 'Zebra', metadata: { series: 'Series' } as never }),
      makeBook({ title: 'Apple', metadata: { series: 'Series' } as never }),
    ];
    books.sort(createWithinGroupSorter('series', 'title', 'en'));
    expect(books[0]!.title).toBe('Apple');
    expect(books[1]!.title).toBe('Zebra');
  });
});

describe('getBookSortValue / getGroupSortValue', () => {
  it('should return title as sort value', () => {
    const book = makeBook({ title: 'My Book' });
    expect(getBookSortValue(book, 'title')).toBe('My Book');
  });

  it('should return updatedAt for updated sort', () => {
    const book = makeBook({ updatedAt: 5000 });
    expect(getBookSortValue(book, 'updated')).toBe(5000);
  });

  it('should return group name for text-based sorts', () => {
    const group: BooksGroup = {
      id: 'g1',
      name: 'Group Name',
      displayName: 'Group Name',
      books: [makeBook()],
      updatedAt: 1000,
    };
    expect(getGroupSortValue(group, 'title')).toBe('Group Name');
  });

  it('should return max updatedAt for date-based sorts', () => {
    const group: BooksGroup = {
      id: 'g1',
      name: 'Group',
      displayName: 'Group',
      books: [makeBook({ updatedAt: 1000 }), makeBook({ updatedAt: 3000 })],
      updatedAt: 3000,
    };
    expect(getGroupSortValue(group, 'updated')).toBe(3000);
  });
});

describe('compareSortValues', () => {
  it('should compare strings using locale', () => {
    expect(compareSortValues('apple', 'banana', 'en')).toBeLessThan(0);
    expect(compareSortValues('banana', 'apple', 'en')).toBeGreaterThan(0);
    expect(compareSortValues('apple', 'apple', 'en')).toBe(0);
  });

  it('should compare numbers', () => {
    expect(compareSortValues(1, 2, 'en')).toBeLessThan(0);
    expect(compareSortValues(2, 1, 'en')).toBeGreaterThan(0);
    expect(compareSortValues(1, 1, 'en')).toBe(0);
  });

  it('should return 0 for mixed types', () => {
    expect(compareSortValues('a', 1, 'en')).toBe(0);
  });
});

describe('findGroupById / getGroupDisplayName', () => {
  const group: BooksGroup = {
    id: 'g1',
    name: 'Test Group',
    displayName: 'Display Name',
    books: [],
    updatedAt: 1000,
  };
  const items: (Book | BooksGroup)[] = [makeBook(), group];

  it('should find group by id', () => {
    expect(findGroupById(items, 'g1')).toBe(group);
    expect(findGroupById(items, 'nonexistent')).toBeUndefined();
  });

  it('should get display name', () => {
    expect(getGroupDisplayName(items, 'g1')).toBe('Display Name');
    expect(getGroupDisplayName(items, 'nonexistent')).toBeUndefined();
  });
});

describe('createGroupSorter', () => {
  it('should sort groups by name for title sort', () => {
    const groups: BooksGroup[] = [
      { id: 'g2', name: 'Zebra', displayName: 'Zebra', books: [makeBook()], updatedAt: 1000 },
      { id: 'g1', name: 'Apple', displayName: 'Apple', books: [makeBook()], updatedAt: 2000 },
    ];
    groups.sort(createGroupSorter('title', 'en'));
    expect(groups[0]!.name).toBe('Apple');
    expect(groups[1]!.name).toBe('Zebra');
  });

  it('should sort groups by most recent update for updated sort', () => {
    const groups: BooksGroup[] = [
      {
        id: 'g1',
        name: 'A',
        displayName: 'A',
        books: [makeBook({ updatedAt: 5000 })],
        updatedAt: 5000,
      },
      {
        id: 'g2',
        name: 'B',
        displayName: 'B',
        books: [makeBook({ updatedAt: 1000 })],
        updatedAt: 1000,
      },
    ];
    groups.sort(createGroupSorter('updated', 'en'));
    expect(groups[0]!.name).toBe('B');
    expect(groups[1]!.name).toBe('A');
  });
});
