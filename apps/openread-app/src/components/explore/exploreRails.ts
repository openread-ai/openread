import type { UseExploreBooksParams } from '@/hooks/useExploreBooks';

export type ExploreRailId =
  | 'trending'
  | 'recently-added'
  | 'classic-literature'
  | 'computer-science'
  | 'open-textbooks'
  | 'short-reads';

export interface ExploreRailDefinition {
  id: ExploreRailId;
  title: string;
  description: string;
  params: Pick<UseExploreBooksParams, 'subject' | 'sources' | 'sort' | 'minPages' | 'maxPages'>;
}

export const EXPLORE_RAILS: ExploreRailDefinition[] = [
  {
    id: 'trending',
    title: 'Trending',
    description: 'Popular books from the full catalog.',
    params: { sort: 'popularity' },
  },
  {
    id: 'recently-added',
    title: 'Recently Added',
    description: 'Newest books available in OpenRead.',
    params: { sort: 'added_desc' },
  },
  {
    id: 'classic-literature',
    title: 'Classic Literature',
    description: 'Public-domain classics from Standard Ebooks.',
    params: { sources: ['standard-ebooks'], sort: 'popularity' },
  },
  {
    id: 'computer-science',
    title: 'Computer Science',
    description: 'Programming, algorithms, and computing fundamentals.',
    params: { subject: 'Computer Science', sort: 'popularity' },
  },
  {
    id: 'open-textbooks',
    title: 'Open Textbooks',
    description: 'Textbooks and academic books from open catalog sources.',
    params: { sources: ['openstax', 'oapen', 'doab'], sort: 'popularity' },
  },
  {
    id: 'short-reads',
    title: 'Short Reads',
    description: 'Approachable books under 150 pages.',
    params: { maxPages: 150, sort: 'popularity' },
  },
];

export function getExploreRail(id: string | null | undefined): ExploreRailDefinition | null {
  if (!id) return null;
  return EXPLORE_RAILS.find((rail) => rail.id === id) ?? null;
}

export function getExploreRailHref(id: ExploreRailId): string {
  return `/explore?rail=${encodeURIComponent(id)}`;
}
