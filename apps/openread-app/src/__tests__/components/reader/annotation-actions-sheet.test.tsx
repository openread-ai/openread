import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FiCopy, FiSearch } from 'react-icons/fi';

import AnnotationActionsSheet from '@/app/reader/components/annotator/AnnotationActionsSheet';

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ safeAreaInsets: { bottom: 8 } }),
}));

describe('AnnotationActionsSheet', () => {
  it('renders a fixed selection actions toolbar without an overlay', async () => {
    const onCopy = vi.fn();
    const onDismiss = vi.fn();
    render(
      <AnnotationActionsSheet
        buttons={[
          { tooltipText: 'Copy', Icon: FiCopy, onClick: onCopy },
          { tooltipText: 'Dictionary', Icon: FiSearch, onClick: vi.fn() },
          { tooltipText: 'Search', Icon: FiSearch, onClick: vi.fn(), disabled: true },
          { tooltipText: 'Hidden', Icon: FiSearch, onClick: vi.fn(), visible: false },
        ]}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByRole('toolbar', { name: 'Selection actions' })).toBeTruthy();
    expect(
      screen.getByText('Selection actions scroll horizontally when more actions are available.'),
    ).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Copy' }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Dictionary' }).textContent).toContain('Dictionary');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Search' }).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Hidden' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(onCopy).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss selection actions' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
