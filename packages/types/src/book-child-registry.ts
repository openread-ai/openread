const BOOK_TOMBSTONE_CASCADE = {
  rpc: 'soft_delete_active_files_for_book_tombstone',
  argumentTypes: ['uuid', 'text', 'timestamp with time zone'],
} as const;

export const BOOK_CHILD_REGISTRY = {
  files: {
    bookLink: {
      kind: 'direct',
      userColumn: 'user_id',
      bookHashColumn: 'book_hash',
    },
    tombstoneCascade: {
      ...BOOK_TOMBSTONE_CASCADE,
      resultIdColumn: 'file_id',
    },
  },
  book_notes: {
    bookLink: {
      kind: 'direct',
      userColumn: 'user_id',
      bookHashColumn: 'book_hash',
    },
    tombstoneCascade: BOOK_TOMBSTONE_CASCADE,
  },
  book_configs: {
    bookLink: {
      kind: 'direct',
      userColumn: 'user_id',
      bookHashColumn: 'book_hash',
    },
    tombstoneCascade: BOOK_TOMBSTONE_CASCADE,
  },
  ai_conversations: {
    bookLink: {
      kind: 'direct',
      userColumn: 'user_id',
      bookHashColumn: 'book_hash',
    },
    tombstoneCascade: BOOK_TOMBSTONE_CASCADE,
  },
  ai_messages: {
    bookLink: {
      kind: 'indirect',
      userColumn: 'user_id',
      via: {
        table: 'ai_conversations',
        userColumn: 'user_id',
        childColumn: 'conversation_id',
        parentColumn: 'id',
        bookHashColumn: 'book_hash',
      },
    },
    tombstoneCascade: BOOK_TOMBSTONE_CASCADE,
  },
} as const;

export type BookChildRegistryKey = keyof typeof BOOK_CHILD_REGISTRY;
