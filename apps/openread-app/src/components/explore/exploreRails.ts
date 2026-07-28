import type { CatalogSubject } from '@openread/types';
import type { UseExploreBooksParams } from '@/hooks/useExploreBooks';

export interface ExploreRailDefinition {
  id: string;
  title: string;
  description: string;
  bookCount: number;
  params: Pick<UseExploreBooksParams, 'subject' | 'sort'>;
}

export function createExploreRail(subject: CatalogSubject): ExploreRailDefinition {
  return {
    id: subject.subject_name,
    title: subject.subject_name,
    description: `${subject.book_count} books in ${subject.subject_name}.`,
    bookCount: subject.book_count,
    params: { subject: subject.subject_name, sort: 'popularity' },
  };
}

export function getExploreRailHref(subject: string): string {
  return `/explore?subject=${encodeURIComponent(subject)}`;
}
