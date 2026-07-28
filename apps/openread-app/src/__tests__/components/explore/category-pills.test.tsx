import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { CategoryPills } from '@/components/explore/CategoryPills';

const categories = [
  { subject_name: 'Literature & Fiction', book_count: 475 },
  { subject_name: 'History', book_count: 63 },
  { subject_name: 'Biography & Memoir', book_count: 41 },
  { subject_name: 'Philosophy & Religion', book_count: 22 },
  { subject_name: 'Travel & Leisure', book_count: 22 },
  { subject_name: 'Society & Politics', book_count: 15 },
  { subject_name: 'Science & Nature', book_count: 6 },
  { subject_name: 'Education & Reference', book_count: 5 },
  { subject_name: 'Technology & Engineering', book_count: 4 },
  { subject_name: 'Business & Economics', book_count: 2 },
  { subject_name: 'Arts & Culture', book_count: 1 },
  { subject_name: 'Empty', book_count: 0 },
];

afterEach(cleanup);

describe('CategoryPills', () => {
  it('renders live non-zero categories with All active', () => {
    render(<CategoryPills categories={categories} />);

    expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Literature & Fiction/ })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Empty/ })).toBeNull();
    expect(screen.getByRole('tablist', { name: 'Book categories' })).toBeTruthy();
  });

  it('progressively reveals categories beyond the first ten', () => {
    render(<CategoryPills categories={categories} />);

    expect(screen.queryByRole('tab', { name: /Arts & Culture/ })).toBeNull();
    fireEvent.click(screen.getByTestId('more-categories-button'));
    expect(screen.getByRole('tab', { name: /Arts & Culture/ })).toBeTruthy();
    expect(screen.queryByTestId('more-categories-button')).toBeNull();
  });

  it('selects, switches, and clears an exact live category', () => {
    const onCategoryChange = vi.fn();
    const onSelectionChange = vi.fn();
    render(
      <CategoryPills
        categories={categories}
        onCategoryChange={onCategoryChange}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /History/ }));
    expect(onCategoryChange).toHaveBeenLastCalledWith(['History']);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: 'History', subjects: ['History'] }),
      null,
    );
    expect(screen.getByRole('tab', { name: /History/ }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: /Literature & Fiction/ }));
    expect(onCategoryChange).toHaveBeenLastCalledWith(['Literature & Fiction']);

    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(onCategoryChange).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('true');
  });

  it('supports keyboard navigation and loading state', () => {
    render(<CategoryPills categories={categories} isLoading />);
    const container = screen.getByTestId('category-pills');
    const all = screen.getByRole('tab', { name: 'All' });

    expect(container.getAttribute('aria-busy')).toBe('true');
    expect(all.getAttribute('tabindex')).toBe('0');
    all.focus();
    fireEvent.keyDown(all, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Literature & Fiction/ }));
  });

  it('applies sticky and custom classes', () => {
    render(<CategoryPills categories={categories} sticky className='px-6' />);
    const container = screen.getByTestId('category-pills');
    expect(container.className).toContain('sticky');
    expect(container.className).toContain('px-6');
  });
});
