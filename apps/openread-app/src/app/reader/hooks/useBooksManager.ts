import { useRouter, useSearchParams } from 'next/navigation';
import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { createBookKey, parseBookRefFromReaderBookKey } from '@/utils/readerBookKey';
import { useParallelViewStore } from '@/store/parallelViewStore';
import { navigateToReader } from '@/utils/nav';

const useBooksManager = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { envConfig } = useEnv();
  const { bookKeys } = useReaderStore();
  const { setBookKeys, initViewState } = useReaderStore();
  const { sideBarBookKey, setSideBarBookKey } = useSidebarStore();
  const { setParallel } = useParallelViewStore();

  const syncSearchParams = (nextBookKeys: string[]) => {
    const ids = nextBookKeys
      .map((key) => parseBookRefFromReaderBookKey(key))
      .filter((bookRef): bookRef is NonNullable<typeof bookRef> => !!bookRef);
    navigateToReader(router, ids, searchParams?.toString() || '', { scroll: false });
  };

  // Append a new book and sync with bookKeys and URL
  const appendBook = (
    id: string,
    isPrimary: boolean,
    isParallel: boolean,
    sourceBookKey = sideBarBookKey,
  ) => {
    const newKey = createBookKey(id);
    initViewState(envConfig, id, newKey, isPrimary);
    const updatedKeys = bookKeys.includes(newKey) ? bookKeys : [...bookKeys, newKey];
    if (!bookKeys.includes(newKey)) {
      setBookKeys(updatedKeys);
    }
    if (isParallel && sourceBookKey) setParallel([sourceBookKey, newKey]);
    setSideBarBookKey(newKey);
    syncSearchParams(updatedKeys);
  };

  // Close a book and sync with bookKeys and URL
  const dismissBook = (bookKey: string) => {
    const updatedKeys = bookKeys.filter((key) => key !== bookKey);
    setBookKeys(updatedKeys);
    syncSearchParams(updatedKeys);
  };

  const getNextBookKey = (bookKey: string) => {
    const index = bookKeys.findIndex((key) => key === bookKey);
    const nextIndex = (index + 1) % bookKeys.length;
    return bookKeys[nextIndex]!;
  };

  const openParallelView = (id: string, sourceBookKey = sideBarBookKey) => {
    const sourceBookId = sourceBookKey ? parseBookRefFromReaderBookKey(sourceBookKey) : undefined;
    appendBook(id, sourceBookId != id, true, sourceBookKey);
  };

  return {
    bookKeys,
    appendBook,
    dismissBook,
    getNextBookKey,
    openParallelView,
  };
};

export default useBooksManager;
