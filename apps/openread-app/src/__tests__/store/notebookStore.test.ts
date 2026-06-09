import { beforeEach, describe, expect, it } from 'vitest';
import { useNotebookStore } from '@/store/notebookStore';
import type { TextSelection } from '@/utils/sel';

const makeSelection = (): TextSelection => ({
  key: 'book-hash',
  text: 'Selected reader text',
  range: document.createRange(),
  index: 0,
  href: 'chapter.xhtml',
});

describe('useNotebookStore', () => {
  beforeEach(() => {
    useNotebookStore.setState({
      notebookWidth: '',
      isNotebookVisible: false,
      isNotebookPinned: false,
      notebookActiveTab: 'notes',
      notebookNewAnnotation: null,
      notebookEditAnnotation: null,
      notebookAnnotationDrafts: {},
    });
  });

  it('opens annotation intent on the notes tab even after AI chat was active', () => {
    const selection = makeSelection();

    useNotebookStore.setState({
      isNotebookVisible: false,
      notebookActiveTab: 'ai',
      notebookEditAnnotation: {
        id: 'existing-note',
        type: 'annotation',
        cfi: 'epubcfi(/6/2)',
        text: 'Old text',
        note: 'Old note',
        createdAt: 1,
        updatedAt: 1,
      },
    });

    useNotebookStore.getState().openNotebookForAnnotation(selection);

    expect(useNotebookStore.getState()).toMatchObject({
      isNotebookVisible: true,
      notebookActiveTab: 'notes',
      notebookNewAnnotation: selection,
      notebookEditAnnotation: null,
    });
  });
});
