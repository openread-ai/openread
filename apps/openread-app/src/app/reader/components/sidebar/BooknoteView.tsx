import React from 'react';
import * as CFI from 'foliate-js/epubcfi.js';
import {
  getBookNoteTargetKey,
  getBookNoteTextCfi,
} from '@/services/annotation/annotationTargetContract';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { findTocItemBS } from '@/utils/toc';
import { TOCItem } from '@/libs/document';
import { BooknoteGroup, BookNoteType } from '@/types/book';
import BooknoteItem from './BooknoteItem';

const BooknoteView: React.FC<{
  type: BookNoteType;
  bookKey: string;
  toc: TOCItem[];
}> = ({ type, bookKey, toc }) => {
  const { getConfig } = useBookDataStore();
  const { setActiveBooknoteType, setBooknoteResults } = useSidebarStore();
  const config = getConfig(bookKey)!;

  const { booknotes: allNotes = [] } = config;
  const booknotes = allNotes.filter((note) => note.type === type && !note.deletedAt);

  const booknoteGroups: { [href: string]: BooknoteGroup } = {};
  for (const booknote of booknotes) {
    const cfi = getBookNoteTextCfi(booknote);
    const tocItem = cfi ? findTocItemBS(toc ?? [], cfi) : null;
    const href = tocItem?.href || '';
    const label = tocItem?.label || '';
    const id = tocItem?.id || 0;
    if (!booknoteGroups[href]) {
      booknoteGroups[href] = { id, href, label, booknotes: [] };
    }
    booknoteGroups[href].booknotes.push(booknote);
  }

  Object.values(booknoteGroups).forEach((group) => {
    group.booknotes.sort((a, b) => {
      const aCfi = getBookNoteTextCfi(a);
      const bCfi = getBookNoteTextCfi(b);
      if (aCfi && bCfi) return CFI.compare(aCfi, bCfi);
      return getBookNoteTargetKey(a).localeCompare(getBookNoteTargetKey(b));
    });
  });

  const sortedGroups = Object.values(booknoteGroups).sort((a, b) => {
    return a.id - b.id;
  });

  const handleBrowseBookNotes = () => {
    if (booknotes.length === 0) return;

    const sorted = [...booknotes].sort((a, b) => {
      const aCfi = getBookNoteTextCfi(a);
      const bCfi = getBookNoteTextCfi(b);
      if (aCfi && bCfi) return CFI.compare(aCfi, bCfi);
      return getBookNoteTargetKey(a).localeCompare(getBookNoteTargetKey(b));
    });
    setActiveBooknoteType(bookKey, type);
    setBooknoteResults(bookKey, sorted);
  };

  return (
    <div className='rounded pt-2'>
      <ul role='tree' className='px-2'>
        {sortedGroups.map((group) => (
          <li key={group.href} className='p-2'>
            <h3 className='content font-size-base line-clamp-1 font-normal'>{group.label}</h3>
            <ul>
              {group.booknotes.map((item, index) => (
                <BooknoteItem
                  key={`${index}-${getBookNoteTargetKey(item)}`}
                  bookKey={bookKey}
                  item={item}
                  onClick={handleBrowseBookNotes}
                />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default BooknoteView;
