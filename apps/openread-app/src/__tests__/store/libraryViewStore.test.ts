import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryViewStore } from '@/store/libraryViewStore';

describe('libraryViewStore', () => {
  beforeEach(() => {
    // Reset store between tests
    useLibraryViewStore.setState({
      searchQuery: '',
      gridSize: 'medium',
      isSelectMode: false,
      selectedBooks: [],
    });
  });

  describe('searchQuery', () => {
    it('updates search query', () => {
      useLibraryViewStore.getState().setSearchQuery('test');
      expect(useLibraryViewStore.getState().searchQuery).toBe('test');
    });

    it('clears search query with empty string', () => {
      useLibraryViewStore.getState().setSearchQuery('test');
      useLibraryViewStore.getState().setSearchQuery('');
      expect(useLibraryViewStore.getState().searchQuery).toBe('');
    });
  });

  describe('gridSize', () => {
    it('defaults to medium', () => {
      expect(useLibraryViewStore.getState().gridSize).toBe('medium');
    });

    it('updates grid size to small', () => {
      useLibraryViewStore.getState().setGridSize('small');
      expect(useLibraryViewStore.getState().gridSize).toBe('small');
    });

    it('updates grid size to large', () => {
      useLibraryViewStore.getState().setGridSize('large');
      expect(useLibraryViewStore.getState().gridSize).toBe('large');
    });
  });

  describe('selectMode', () => {
    it('enables select mode', () => {
      useLibraryViewStore.getState().setSelectMode(true);
      expect(useLibraryViewStore.getState().isSelectMode).toBe(true);
    });

    it('disables select mode', () => {
      useLibraryViewStore.getState().setSelectMode(true);
      useLibraryViewStore.getState().setSelectMode(false);
      expect(useLibraryViewStore.getState().isSelectMode).toBe(false);
    });

    it('clears selection when disabling select mode', () => {
      const store = useLibraryViewStore.getState();
      store.setSelectMode(true);
      store.toggleBookSelection('book1');
      store.toggleBookSelection('book2');
      expect(useLibraryViewStore.getState().selectedBooks).toHaveLength(2);

      useLibraryViewStore.getState().setSelectMode(false);
      expect(useLibraryViewStore.getState().selectedBooks).toHaveLength(0);
    });

    it('preserves selection when re-enabling select mode', () => {
      const store = useLibraryViewStore.getState();
      store.setSelectMode(true);
      store.toggleBookSelection('book1');
      expect(useLibraryViewStore.getState().selectedBooks).toHaveLength(1);

      // Re-enable without disabling first
      useLibraryViewStore.getState().setSelectMode(true);
      expect(useLibraryViewStore.getState().selectedBooks).toHaveLength(1);
    });
  });

  describe('book selection', () => {
    beforeEach(() => {
      useLibraryViewStore.getState().setSelectMode(true);
    });

    it('adds book to selection with toggleBookSelection', () => {
      useLibraryViewStore.getState().toggleBookSelection('book1');
      expect(useLibraryViewStore.getState().selectedBooks).toContain('book1');
    });

    it('removes book from selection with toggleBookSelection', () => {
      const store = useLibraryViewStore.getState();
      store.toggleBookSelection('book1');
      expect(useLibraryViewStore.getState().selectedBooks).toContain('book1');

      useLibraryViewStore.getState().toggleBookSelection('book1');
      expect(useLibraryViewStore.getState().selectedBooks).not.toContain('book1');
    });

    it('handles multiple book selections', () => {
      const store = useLibraryViewStore.getState();
      store.toggleBookSelection('book1');
      store.toggleBookSelection('book2');
      store.toggleBookSelection('book3');

      const selectedBooks = useLibraryViewStore.getState().selectedBooks;
      expect(selectedBooks).toHaveLength(3);
      expect(selectedBooks).toContain('book1');
      expect(selectedBooks).toContain('book2');
      expect(selectedBooks).toContain('book3');
    });

    it('selects all books', () => {
      useLibraryViewStore.getState().selectAll(['book1', 'book2', 'book3']);
      expect(useLibraryViewStore.getState().selectedBooks).toEqual(['book1', 'book2', 'book3']);
    });

    it('replaces existing selection with selectAll', () => {
      const store = useLibraryViewStore.getState();
      store.toggleBookSelection('oldBook');
      expect(useLibraryViewStore.getState().selectedBooks).toContain('oldBook');

      useLibraryViewStore.getState().selectAll(['newBook1', 'newBook2']);
      expect(useLibraryViewStore.getState().selectedBooks).toEqual(['newBook1', 'newBook2']);
      expect(useLibraryViewStore.getState().selectedBooks).not.toContain('oldBook');
    });

    it('clears selection', () => {
      const store = useLibraryViewStore.getState();
      store.selectAll(['book1', 'book2']);
      expect(useLibraryViewStore.getState().selectedBooks).toHaveLength(2);

      useLibraryViewStore.getState().clearSelection();
      expect(useLibraryViewStore.getState().selectedBooks).toHaveLength(0);
    });

    it('handles empty selectAll', () => {
      useLibraryViewStore.getState().selectAll([]);
      expect(useLibraryViewStore.getState().selectedBooks).toHaveLength(0);
    });
  });

  describe('persist configuration', () => {
    it('has correct storage name', () => {
      // Access the persist API to check configuration
      const persistOptions = useLibraryViewStore.persist;
      expect(persistOptions.getOptions().name).toBe('library-view-storage');
    });
  });
});
