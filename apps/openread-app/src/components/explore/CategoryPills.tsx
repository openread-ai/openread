'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { CatalogSubject } from '@openread/types';
import { cn } from '@/utils/tailwind';

export interface CategoryNode {
  label: string;
  subjects: string[];
  children: { label: string; subject: string }[];
}

export interface CategoryPillsProps {
  categories: CatalogSubject[];
  isLoading?: boolean;
  onCategoryChange?: (subjects: string[] | undefined) => void;
  onSelectionChange?: (category: CategoryNode | null, subcategory: string | null) => void;
  sticky?: boolean;
  className?: string;
}

const MAX_VISIBLE_PILLS = 10;
const PILL_ACTIVE = 'bg-base-content text-base-100';
const PILL_INACTIVE = 'bg-base-100 border border-base-300 text-base-content/60 hover:bg-base-200';
const PILL_MORE =
  'bg-base-100 border border-dashed border-base-300 text-base-content/60 hover:bg-base-200';
const PILL_BASE =
  'h-8 flex-shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium transition-colors font-[Inter,system-ui,sans-serif] cursor-pointer select-none';

export function CategoryPills({
  categories,
  isLoading = false,
  onCategoryChange,
  onSelectionChange,
  sticky = false,
  className,
}: CategoryPillsProps) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const pillContainerRef = useRef<HTMLDivElement>(null);

  const categoryNodes = useMemo(
    () =>
      categories
        .filter((category) => category.book_count > 0)
        .map((category) => ({
          label: category.subject_name,
          subjects: [category.subject_name],
          children: [],
          count: category.book_count,
        })),
    [categories],
  );
  const activeCategory = categoryNodes.find((category) => category.label === activeLabel) ?? null;
  const visibleCategories = showAllCategories
    ? categoryNodes
    : categoryNodes.slice(0, MAX_VISIBLE_PILLS);
  const hiddenCount = categoryNodes.length - MAX_VISIBLE_PILLS;

  const handleCategoryClick = useCallback(
    (category: CategoryNode | null) => {
      setActiveLabel(category?.label ?? null);
      onCategoryChange?.(category?.subjects);
      onSelectionChange?.(category, null);
    },
    [onCategoryChange, onSelectionChange],
  );

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    const tabs = Array.from(
      pillContainerRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
    );
    const currentIndex = tabs.findIndex((tab) => tab === document.activeElement);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      event.preventDefault();
      nextIndex = 0;
    } else if (event.key === 'End') {
      event.preventDefault();
      nextIndex = tabs.length - 1;
    }
    tabs[nextIndex]?.focus();
  }, []);

  return (
    <div
      className={cn('flex flex-col gap-2', sticky && 'sticky top-0 z-10', className)}
      data-testid='category-pills'
      aria-busy={isLoading}
    >
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- tablist delegates focus to child tabs */}
      <div
        ref={pillContainerRef}
        role='tablist'
        aria-label='Book categories'
        className='scrollbar-none flex flex-wrap gap-2'
        onKeyDown={handleKeyDown}
      >
        <button
          type='button'
          role='tab'
          aria-selected={!activeCategory}
          tabIndex={!activeCategory ? 0 : -1}
          onClick={() => handleCategoryClick(null)}
          className={cn(PILL_BASE, !activeCategory ? PILL_ACTIVE : PILL_INACTIVE)}
        >
          All
        </button>

        {visibleCategories.map((category) => {
          const isActive = activeCategory?.label === category.label;
          return (
            <button
              key={category.label}
              type='button'
              role='tab'
              aria-selected={isActive}
              aria-label={`${category.label}, ${category.count} books`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => handleCategoryClick(isActive ? null : category)}
              className={cn(PILL_BASE, isActive ? PILL_ACTIVE : PILL_INACTIVE)}
            >
              {category.label}
            </button>
          );
        })}

        {!showAllCategories && hiddenCount > 0 && (
          <button
            type='button'
            onClick={() => setShowAllCategories(true)}
            className={cn(PILL_BASE, PILL_MORE)}
            data-testid='more-categories-button'
          >
            +{hiddenCount} more
          </button>
        )}
      </div>
    </div>
  );
}
