import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { RenameBookDialog } from '@/components/platform/rename-book-dialog';
import type { Book } from '@/types/book';

// Mock useBookActions
const mockRenameBook = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useBookActions', () => ({
  useBookActions: () => ({
    renameBook: mockRenameBook,
  }),
}));

// Create a minimal mock book for testing
const createMockBook = (overrides?: Partial<Book>): Book => ({
  hash: 'book-123',
  title: 'Original Title',
  author: 'Test Author',
  format: 'epub',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

describe('RenameBookDialog', () => {
  const mockBook = createMockBook();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Initial State', () => {
    it('should render dialog with title and description', () => {
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      expect(screen.getByText('Rename Book')).toBeTruthy();
      expect(screen.getByText('Enter a new title for this book.')).toBeTruthy();
    });

    it('should show current title in input when opened', () => {
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('Original Title');
    });

    it('should render Cancel and Save buttons', () => {
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /save/i })).toBeTruthy();
    });

    it('should have input with label', () => {
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      const input = screen.getByLabelText(/title/i);
      expect(input).toBeTruthy();
    });

    it('should not render dialog content when closed', () => {
      render(<RenameBookDialog book={mockBook} open={false} onOpenChange={() => {}} />);

      expect(screen.queryByText('Rename Book')).toBeNull();
    });
  });

  describe('Save Button State', () => {
    it('should disable save when title is empty', () => {
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '' } });

      const saveButton = screen.getByRole('button', { name: /save/i }) as HTMLButtonElement;
      expect(saveButton.disabled).toBe(true);
    });

    it('should disable save when title is only whitespace', () => {
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '   ' } });

      const saveButton = screen.getByRole('button', { name: /save/i }) as HTMLButtonElement;
      expect(saveButton.disabled).toBe(true);
    });

    it('should disable save when title is unchanged', () => {
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      // Title is same as original
      const saveButton = screen.getByRole('button', { name: /save/i }) as HTMLButtonElement;
      expect(saveButton.disabled).toBe(true);
    });

    it('should enable save when title is changed to valid value', () => {
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'New Title' } });

      const saveButton = screen.getByRole('button', { name: /save/i }) as HTMLButtonElement;
      expect(saveButton.disabled).toBe(false);
    });

    it('should enable save when title is changed with trailing whitespace', () => {
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'New Title  ' } });

      const saveButton = screen.getByRole('button', { name: /save/i }) as HTMLButtonElement;
      expect(saveButton.disabled).toBe(false);
    });
  });

  describe('Save Action', () => {
    it('should call renameBook and close dialog on save', async () => {
      const onOpenChange = vi.fn();
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={onOpenChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'New Title' } });
      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(mockRenameBook).toHaveBeenCalledWith(mockBook, 'New Title');
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('should show loading state while saving', async () => {
      // Make renameBook take some time
      mockRenameBook.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'New Title' } });
      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      // Check loading state
      expect(screen.getByText('Saving...')).toBeTruthy();
      const savingButton = screen.getByRole('button', { name: /saving/i }) as HTMLButtonElement;
      expect(savingButton.disabled).toBe(true);
      const cancelButton = screen.getByRole('button', { name: /cancel/i }) as HTMLButtonElement;
      expect(cancelButton.disabled).toBe(true);
      expect(input.disabled).toBe(true);

      await waitFor(() => {
        expect(mockRenameBook).toHaveBeenCalled();
      });
    });

    it('should not call renameBook when book is null', () => {
      render(<RenameBookDialog book={null} open={true} onOpenChange={() => {}} />);

      // Save button should be disabled when no book
      const saveButton = screen.getByRole('button', { name: /save/i }) as HTMLButtonElement;
      expect(saveButton.disabled).toBe(true);
    });
  });

  describe('Cancel Action', () => {
    it('should close dialog on cancel without saving', () => {
      const onOpenChange = vi.fn();
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockRenameBook).not.toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('should not save when cancel is clicked after editing', () => {
      const onOpenChange = vi.fn();
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={onOpenChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'New Title' } });
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockRenameBook).not.toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Keyboard Interactions', () => {
    it('should submit on Enter key when title is changed', async () => {
      const onOpenChange = vi.fn();
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={onOpenChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'New Title' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockRenameBook).toHaveBeenCalledWith(mockBook, 'New Title');
      });
    });

    it('should not submit on Enter when title is empty', () => {
      const onOpenChange = vi.fn();
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={onOpenChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockRenameBook).not.toHaveBeenCalled();
    });

    it('should not submit on Enter when title is unchanged', () => {
      const onOpenChange = vi.fn();
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={onOpenChange} />);

      const input = screen.getByRole('textbox');
      // Title is still "Original Title"
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockRenameBook).not.toHaveBeenCalled();
    });

    it('should not trigger submit on other key presses', () => {
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'New Title' } });
      fireEvent.keyDown(input, { key: 'Tab' });
      fireEvent.keyDown(input, { key: 'a' });

      expect(mockRenameBook).not.toHaveBeenCalled();
    });
  });

  describe('Dialog State Management', () => {
    it('should reset title when dialog reopens with same book', () => {
      const { rerender } = render(
        <RenameBookDialog book={mockBook} open={true} onOpenChange={() => {}} />,
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Changed Title' } });
      expect(input.value).toBe('Changed Title');

      // Close and reopen
      rerender(<RenameBookDialog book={mockBook} open={false} onOpenChange={() => {}} />);
      rerender(<RenameBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      const reopenedInput = screen.getByRole('textbox') as HTMLInputElement;
      expect(reopenedInput.value).toBe('Original Title');
    });

    it('should update title when dialog opens with different book', () => {
      const anotherBook = createMockBook({
        hash: 'book-456',
        title: 'Another Book Title',
      });

      const { rerender } = render(
        <RenameBookDialog book={mockBook} open={true} onOpenChange={() => {}} />,
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('Original Title');

      rerender(<RenameBookDialog book={anotherBook} open={true} onOpenChange={() => {}} />);

      const updatedInput = screen.getByRole('textbox') as HTMLInputElement;
      expect(updatedInput.value).toBe('Another Book Title');
    });

    it('should handle null book gracefully', () => {
      render(<RenameBookDialog book={null} open={true} onOpenChange={() => {}} />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('');

      const saveButton = screen.getByRole('button', { name: /save/i }) as HTMLButtonElement;
      expect(saveButton.disabled).toBe(true);
    });
  });

  describe('Input Field', () => {
    it('should have placeholder text', () => {
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      const input = screen.getByRole('textbox');
      expect(input.getAttribute('placeholder')).toBe('Enter book title');
    });

    it('should have id for accessibility', () => {
      render(<RenameBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      const input = screen.getByRole('textbox');
      expect(input.getAttribute('id')).toBe('book-title');
    });
  });
});
