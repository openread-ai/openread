import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// Mock dependencies
vi.mock('@/utils/access', () => ({
  getAccessToken: vi.fn().mockResolvedValue('test-token'),
}));

vi.mock('@/services/environment', () => ({
  getAPIBaseUrl: () => 'http://localhost:3000/api',
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { ModelPicker, _clearModelsCacheForTesting } from '@/components/assistant/ModelPicker';

describe('ModelPicker', () => {
  const defaultProps = {
    provider: 'openai',
    selectedModel: 'gpt-4o',
    onSelectModel: vi.fn(),
    onManageProviders: vi.fn(),
    isOpen: true,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    _clearModelsCacheForTesting();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
          { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'openai' },
          { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' },
        ]),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('should not render when isOpen is false', () => {
    const { container } = render(<ModelPicker {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('should render search input when open', () => {
    render(<ModelPicker {...defaultProps} />);
    expect(screen.getByPlaceholderText('Search models...')).toBeTruthy();
  });

  it('should fetch and display models', async () => {
    render(<ModelPicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('GPT-4o')).toBeTruthy();
      expect(screen.getByText('GPT-4o mini')).toBeTruthy();
      expect(screen.getByText('GPT-3.5 Turbo')).toBeTruthy();
    });
  });

  it('should filter models based on search', async () => {
    render(<ModelPicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('GPT-4o')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText('Search models...');
    fireEvent.change(searchInput, { target: { value: 'mini' } });

    await waitFor(() => {
      expect(screen.getByText('GPT-4o mini')).toBeTruthy();
      expect(screen.queryByText('GPT-3.5 Turbo')).toBeNull();
    });
  });

  it('should call onSelectModel when a model is clicked', async () => {
    render(<ModelPicker {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('GPT-4o mini')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('GPT-4o mini'));
    expect(defaultProps.onSelectModel).toHaveBeenCalledWith('gpt-4o-mini');
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('should show Manage providers link', () => {
    render(<ModelPicker {...defaultProps} />);
    expect(screen.getByText('Manage providers')).toBeTruthy();
  });

  it('should call onManageProviders when link is clicked', () => {
    render(<ModelPicker {...defaultProps} />);
    fireEvent.click(screen.getByText('Manage providers'));
    expect(defaultProps.onManageProviders).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('should not show Manage providers when callback is not provided', () => {
    render(<ModelPicker {...defaultProps} onManageProviders={undefined} />);
    expect(screen.queryByText('Manage providers')).toBeNull();
  });

  it('should show loading indicator while fetching models', async () => {
    // Use a provider that won't hit cache
    mockFetch.mockReturnValue(new Promise(() => {})); // Never resolves
    render(<ModelPicker {...defaultProps} provider='anthropic' />);
    // While fetch is pending, no model items should be rendered
    // The "No models found" empty state should also not appear since loading is true
    expect(screen.queryByText('No models found')).toBeNull();
  });

  it('should show fallback models on fetch error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    render(<ModelPicker {...defaultProps} />);

    await waitFor(() => {
      // Should show default OpenAI models
      expect(screen.getByText('gpt-4o')).toBeTruthy();
    });
  });

  it('should reset search when popover closes', async () => {
    const { rerender } = render(<ModelPicker {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText('Search models...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    // Close and reopen
    rerender(<ModelPicker {...defaultProps} isOpen={false} />);
    rerender(<ModelPicker {...defaultProps} isOpen={true} />);

    await waitFor(() => {
      const input = screen.getByPlaceholderText('Search models...');
      expect((input as HTMLInputElement).value).toBe('');
    });
  });
});
