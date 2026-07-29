import React from 'react';
import DOMPurify from 'dompurify';
import {
  MdOutlineCloudDownload,
  MdOutlineCloudUpload,
  MdOutlineEdit,
  MdSaveAlt,
} from 'react-icons/md';

import { Book } from '@/types/book';
import { BookMetadata } from '@/libs/document';
import { useTranslation } from '@/hooks/useTranslation';
import {
  formatAuthors,
  formatDate,
  formatBytes,
  formatLanguage,
  formatPublisher,
  formatTitle,
} from '@/utils/book';
import BookCover from '@/components/BookCover';

interface BookDetailViewProps {
  book: Book;
  metadata: BookMetadata | null;
  fileSize: number | null;
  onEdit?: () => void;
  onDownload?: () => void;
  onUpload?: () => void;
  onExport?: () => void;
}

const BookDetailView: React.FC<BookDetailViewProps> = ({
  book,
  metadata,
  fileSize,
  onEdit,
  onDownload,
  onUpload,
  onExport,
}) => {
  const _ = useTranslation();

  return (
    <div className='relative w-full rounded-lg'>
      <div className='mb-6 me-4 flex h-32 items-start'>
        <div className='me-6 aspect-[28/41] h-32 shadow-lg sm:me-10'>
          <BookCover mode='list' book={book} />
        </div>
        <div className='title-author flex h-32 flex-col justify-between'>
          <div>
            <p className='text-base-content mb-2 line-clamp-2 break-words text-lg font-bold'>
              {formatTitle(book.title).replace(/\u00A0/g, ' ') || _('Untitled')}
            </p>
            <p className='text-neutral-content line-clamp-1'>
              {formatAuthors(book.author, book.primaryLanguage) || _('Unknown')}
            </p>
          </div>
          <div className='flex flex-nowrap items-center gap-3 sm:gap-x-4'>
            {onEdit && (
              <button
                onClick={onEdit}
                className={!metadata ? 'btn-disabled opacity-50' : ''}
                title={_('Edit Metadata')}
              >
                <MdOutlineEdit className='hover:fill-blue-500' />
              </button>
            )}
            {book.uploadedAt && onDownload && (
              <button onClick={onDownload} title={_('Download from Cloud')}>
                <MdOutlineCloudDownload className='fill-base-content' />
              </button>
            )}
            {book.downloadedAt && onUpload && (
              <button onClick={onUpload} title={_('Upload to Cloud')}>
                <MdOutlineCloudUpload className='fill-base-content' />
              </button>
            )}
            {book.downloadedAt && onExport && (
              <button onClick={onExport} title={_('Export Book')}>
                <MdSaveAlt className='fill-base-content' />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className='text-base-content my-4'>
        <div className='mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3'>
          <div className='overflow-hidden'>
            <span className='font-bold'>{_('Publisher')}</span>
            <p className='text-neutral-content text-sm'>
              {formatPublisher(metadata?.publisher || '') || _('Unknown')}
            </p>
          </div>
          <div className='overflow-hidden'>
            <span className='font-bold'>{_('Published')}</span>
            <p className='text-neutral-content text-sm'>
              {formatDate(metadata?.published, true) || _('Unknown')}
            </p>
          </div>
          <div className='overflow-hidden'>
            <span className='font-bold'>{_('Updated')}</span>
            <p className='text-neutral-content text-sm'>{formatDate(book.updatedAt) || ''}</p>
          </div>
          <div className='overflow-hidden'>
            <span className='font-bold'>{_('Added')}</span>
            <p className='text-neutral-content text-sm'>{formatDate(book.createdAt) || ''}</p>
          </div>
          <div className='overflow-hidden'>
            <span className='font-bold'>{_('Language')}</span>
            <p className='text-neutral-content text-sm'>
              {formatLanguage(metadata?.language) || _('Unknown')}
            </p>
          </div>
          <div className='overflow-hidden'>
            <span className='font-bold'>{_('Subjects')}</span>
            <p className='text-neutral-content line-clamp-3 text-sm'>
              {formatAuthors(metadata?.subject || '') || _('Unknown')}
            </p>
          </div>
          <div className='overflow-hidden'>
            <span className='font-bold'>{_('Format')}</span>
            <p className='text-neutral-content text-sm'>{book.format || _('Unknown')}</p>
          </div>
          <div className='overflow-hidden'>
            <span className='font-bold'>{_('File Size')}</span>
            <p className='text-neutral-content text-sm'>{formatBytes(fileSize) || _('Unknown')}</p>
          </div>
        </div>
        <div>
          <span className='font-bold'>{_('Description')}</span>
          <p
            className='text-neutral-content prose prose-sm max-w-full whitespace-pre-line text-sm'
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(metadata?.description || _('No description available')),
            }}
          ></p>
        </div>
      </div>
    </div>
  );
};

export default BookDetailView;
