import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PlatformPageHeader } from '@/components/platform/platform-page-header';

describe('PlatformPageHeader', () => {
  afterEach(() => {
    cleanup();
  });

  it('keeps leading navigation outside the title and subtitle stack', () => {
    render(
      <PlatformPageHeader
        leading={<button type='button'>Back</button>}
        title='Awesome'
        subtitle='1 book'
        actions={<button type='button'>Collection options</button>}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'Awesome' });
    const subtitle = screen.getByText('1 book');
    const back = screen.getByRole('button', { name: 'Back' });
    const options = screen.getByRole('button', { name: 'Collection options' });

    expect(heading.parentElement?.parentElement).toBe(subtitle.parentElement);
    expect(back.parentElement).not.toBe(subtitle.parentElement);
    expect(options.closest('[data-testid="platform-page-header"]')).toBeTruthy();
  });
});
