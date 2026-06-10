import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import {
  PlatformMobileToolbarActionProvider,
  PlatformMobileToolbarActionSlot,
  usePlatformMobileToolbarAction,
} from '@/components/platform/mobile-toolbar-action';

function RegisterAction({ onClick }: { onClick: () => void }) {
  const action = useMemo(
    () => ({
      id: 'new-collection',
      label: 'New Collection',
      icon: <Plus aria-hidden='true' />,
      onClick,
      testId: 'mobile-new-collection-button',
    }),
    [onClick],
  );

  usePlatformMobileToolbarAction(action);

  return null;
}

describe('PlatformMobileToolbarAction', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders an empty spacer when no page action is registered', () => {
    render(
      <PlatformMobileToolbarActionProvider>
        <PlatformMobileToolbarActionSlot />
      </PlatformMobileToolbarActionProvider>,
    );

    expect(screen.queryByRole('button', { name: /new collection/i })).toBeNull();
  });

  it('renders and invokes the registered page action', async () => {
    const onClick = vi.fn();

    render(
      <PlatformMobileToolbarActionProvider>
        <RegisterAction onClick={onClick} />
        <PlatformMobileToolbarActionSlot />
      </PlatformMobileToolbarActionProvider>,
    );

    const button = await screen.findByRole('button', { name: /new collection/i });
    expect(button.getAttribute('data-testid')).toBe('mobile-new-collection-button');

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
