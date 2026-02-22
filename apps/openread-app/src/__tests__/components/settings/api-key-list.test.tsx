import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ApiKeyList } from '@/components/settings/api-key-list';
import type { ApiKey } from '@/hooks/useApiKeys';

// Mock useTranslation
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

// Mock eventDispatcher
vi.mock('@/utils/event', () => ({
  eventDispatcher: {
    dispatch: vi.fn(),
  },
}));

// Sample API keys for testing
const mockKeys: ApiKey[] = [
  {
    id: 'key-1',
    description: 'Claude Desktop on MacBook',
    keyPrefix: 'or_abc1234',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    lastUsedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
  },
  {
    id: 'key-2',
    description: 'Cursor IDE',
    keyPrefix: 'or_def5678',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week ago
    lastUsedAt: null, // Never used
  },
];

describe('ApiKeyList', () => {
  const mockOnRevoke = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should render all keys', () => {
      render(<ApiKeyList keys={mockKeys} onRevoke={mockOnRevoke} />);

      expect(screen.getByText('Claude Desktop on MacBook')).toBeTruthy();
      expect(screen.getByText('Cursor IDE')).toBeTruthy();
    });

    it('should show masked key prefixes', () => {
      render(<ApiKeyList keys={mockKeys} onRevoke={mockOnRevoke} />);

      // maskApiKey shows first 7 chars + asterisks
      expect(screen.getByText(/or_abc1\*+/)).toBeTruthy();
      expect(screen.getByText(/or_def5\*+/)).toBeTruthy();
    });

    it('should show creation date', () => {
      render(<ApiKeyList keys={mockKeys} onRevoke={mockOnRevoke} />);

      // Both keys should show "Created" text
      const createdElements = screen.getAllByText(/Created/);
      expect(createdElements.length).toBeGreaterThanOrEqual(2);
    });

    it('should show last used date for keys that have been used', () => {
      render(<ApiKeyList keys={mockKeys} onRevoke={mockOnRevoke} />);

      // First key was used, second wasn't
      expect(screen.getByText(/Last used/)).toBeTruthy();
      expect(screen.getByText('Never used')).toBeTruthy();
    });

    it('should render expand/collapse icon', () => {
      const { container } = render(<ApiKeyList keys={mockKeys} onRevoke={mockOnRevoke} />);

      // ChevronDown icons should be present
      const chevrons = container.querySelectorAll('svg');
      expect(chevrons.length).toBeGreaterThan(0);
    });
  });

  describe('Collapsible behavior', () => {
    it('should be collapsed by default', () => {
      render(<ApiKeyList keys={mockKeys} onRevoke={mockOnRevoke} />);

      // Revoke button should not be visible initially
      expect(screen.queryByRole('button', { name: /revoke key/i })).toBeNull();
    });

    it('should expand when clicked', async () => {
      render(<ApiKeyList keys={mockKeys} onRevoke={mockOnRevoke} />);

      // Click on the first key item
      const firstKey = screen.getByText('Claude Desktop on MacBook');
      fireEvent.click(firstKey.closest('button')!);

      // Wait for the content to be visible
      await waitFor(() => {
        expect(screen.getByText('MCP Configuration')).toBeTruthy();
      });
    });

    it('should show MCP config tabs when expanded', async () => {
      render(<ApiKeyList keys={mockKeys} onRevoke={mockOnRevoke} />);

      // Click on the first key item
      const firstKey = screen.getByText('Claude Desktop on MacBook');
      fireEvent.click(firstKey.closest('button')!);

      // Should show the config help text
      await waitFor(() => {
        expect(screen.getByText('Copy the configuration for your preferred AI tool:')).toBeTruthy();
      });
    });

    it('should show revoke button when expanded', async () => {
      render(<ApiKeyList keys={mockKeys} onRevoke={mockOnRevoke} />);

      // Click on the first key item
      const firstKey = screen.getByText('Claude Desktop on MacBook');
      fireEvent.click(firstKey.closest('button')!);

      // Revoke button should be visible
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /revoke key/i })).toBeTruthy();
      });
    });

    it('should collapse when clicked again', async () => {
      render(<ApiKeyList keys={mockKeys} onRevoke={mockOnRevoke} />);

      const firstKey = screen.getByText('Claude Desktop on MacBook');
      const trigger = firstKey.closest('button')!;

      // Expand
      fireEvent.click(trigger);
      await waitFor(() => {
        expect(screen.getByText('MCP Configuration')).toBeTruthy();
      });

      // Collapse
      fireEvent.click(trigger);
      await waitFor(() => {
        expect(screen.queryByText('MCP Configuration')).toBeNull();
      });
    });

    it('should only allow one key to be expanded at a time', async () => {
      render(<ApiKeyList keys={mockKeys} onRevoke={mockOnRevoke} />);

      // Expand first key
      const firstKey = screen.getByText('Claude Desktop on MacBook');
      fireEvent.click(firstKey.closest('button')!);

      await waitFor(() => {
        expect(screen.getByText('MCP Configuration')).toBeTruthy();
      });

      // Expand second key
      const secondKey = screen.getByText('Cursor IDE');
      fireEvent.click(secondKey.closest('button')!);

      // Should still only have one MCP Configuration visible
      await waitFor(() => {
        const mcpConfigs = screen.getAllByText('MCP Configuration');
        expect(mcpConfigs.length).toBe(1);
      });
    });
  });

  describe('Revoke functionality', () => {
    it('should open revoke dialog when revoke button is clicked', async () => {
      render(<ApiKeyList keys={mockKeys} onRevoke={mockOnRevoke} />);

      // Expand the key
      const firstKey = screen.getByText('Claude Desktop on MacBook');
      fireEvent.click(firstKey.closest('button')!);

      // Click revoke button
      await waitFor(() => {
        const revokeButton = screen.getByRole('button', { name: /revoke key/i });
        fireEvent.click(revokeButton);
      });

      // Dialog should open
      await waitFor(() => {
        expect(screen.getByText('Revoke API Key?')).toBeTruthy();
      });
    });

    it('should show key description in revoke dialog', async () => {
      render(<ApiKeyList keys={mockKeys} onRevoke={mockOnRevoke} />);

      // Expand the key
      const firstKey = screen.getByText('Claude Desktop on MacBook');
      fireEvent.click(firstKey.closest('button')!);

      // Click revoke button
      await waitFor(() => {
        const revokeButton = screen.getByRole('button', { name: /revoke key/i });
        fireEvent.click(revokeButton);
      });

      // Dialog should show key description in the warning message
      await waitFor(() => {
        // The description appears in the dialog warning text
        expect(
          screen.getByText(/permanently revoke the API key "Claude Desktop on MacBook"/),
        ).toBeTruthy();
      });
    });

    it('should call onRevoke when confirmed', async () => {
      render(<ApiKeyList keys={mockKeys} onRevoke={mockOnRevoke} />);

      // Expand the key
      const firstKey = screen.getByText('Claude Desktop on MacBook');
      fireEvent.click(firstKey.closest('button')!);

      // Click revoke button
      await waitFor(() => {
        const revokeButton = screen.getByRole('button', { name: /revoke key/i });
        fireEvent.click(revokeButton);
      });

      // Confirm revoke in dialog
      await waitFor(() => {
        const confirmButton = screen.getByRole('button', { name: /^Revoke Key$/i });
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(mockOnRevoke).toHaveBeenCalledWith('key-1');
      });
    });

    it('should close dialog when cancelled', async () => {
      render(<ApiKeyList keys={mockKeys} onRevoke={mockOnRevoke} />);

      // Expand the key
      const firstKey = screen.getByText('Claude Desktop on MacBook');
      fireEvent.click(firstKey.closest('button')!);

      // Click revoke button
      await waitFor(() => {
        const revokeButton = screen.getByRole('button', { name: /revoke key/i });
        fireEvent.click(revokeButton);
      });

      // Cancel
      await waitFor(() => {
        const cancelButton = screen.getByRole('button', { name: /cancel/i });
        fireEvent.click(cancelButton);
      });

      // Dialog should be closed
      await waitFor(() => {
        expect(screen.queryByText('Revoke API Key?')).toBeNull();
      });

      // onRevoke should not have been called
      expect(mockOnRevoke).not.toHaveBeenCalled();
    });
  });

  describe('Empty state', () => {
    it('should render empty list correctly', () => {
      const { container } = render(<ApiKeyList keys={[]} onRevoke={mockOnRevoke} />);

      // Should have no key items
      expect(container.querySelectorAll('[role="button"]').length).toBe(0);
    });
  });
});

describe('ApiKeyList - Time formatting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('should show "just now" for very recent dates', () => {
    const recentKey: ApiKey = {
      id: 'recent-key',
      description: 'Recent Key',
      keyPrefix: 'or_recent',
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };

    render(<ApiKeyList keys={[recentKey]} onRevoke={vi.fn()} />);

    expect(screen.getByText(/just now/)).toBeTruthy();
  });

  it('should show hours for recent dates', () => {
    const hoursAgoKey: ApiKey = {
      id: 'hours-key',
      description: 'Hours Ago Key',
      keyPrefix: 'or_hours',
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
      lastUsedAt: null,
    };

    render(<ApiKeyList keys={[hoursAgoKey]} onRevoke={vi.fn()} />);

    expect(screen.getByText(/3 hours ago/)).toBeTruthy();
  });

  it('should show days for older dates', () => {
    const daysAgoKey: ApiKey = {
      id: 'days-key',
      description: 'Days Ago Key',
      keyPrefix: 'or_days',
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
      lastUsedAt: null,
    };

    render(<ApiKeyList keys={[daysAgoKey]} onRevoke={vi.fn()} />);

    expect(screen.getByText(/5 days ago/)).toBeTruthy();
  });
});
