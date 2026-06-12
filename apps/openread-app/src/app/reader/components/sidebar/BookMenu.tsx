import clsx from 'clsx';
import React from 'react';
import Image from 'next/image';

import { MdCheck } from 'react-icons/md';
// import { useRouter } from 'next/navigation'; // disabled: Discord
// import { useEnv } from '@/context/EnvContext'; // disabled: Discord
// import { useAuth } from '@/context/AuthContext'; // disabled: Discord
import { useReaderStore } from '@/store/readerStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useTranslation } from '@/hooks/useTranslation';
// import { useSettingsStore } from '@/store/settingsStore'; // disabled: Discord
import { useParallelViewStore } from '@/store/parallelViewStore';
// import { isWebAppPlatform } from '@/services/environment'; // disabled: About Openread
import { eventDispatcher } from '@/utils/event';
import { getParallelReadMenuBooks } from '../../utils/parallelReadEligibility';
// import { DOWNLOAD_OPENREAD_URL } from '@/services/constants'; // disabled: Download Openread
// import { navigateToLogin } from '@/utils/nav'; // disabled: Discord
// import { saveSysSettings } from '@/helpers/settings'; // disabled: Discord
// import { setKOSyncSettingsWindowVisible } from '@/app/reader/components/KOSyncSettings'; // disabled: KOReader
// import { setProofreadRulesVisibility } from '@/app/reader/components/ProofreadRules'; // disabled: Proofread
// import { setAboutDialogVisible } from '@/components/AboutWindow'; // disabled: About
import { useBookDataStore } from '@/store/bookDataStore';
import { sortTocItems } from '@/utils/toc';
import { getBookIdFromKey } from '@/utils/readerBookKey';
import useBooksManager from '../../hooks/useBooksManager';
import MenuItem from '@/components/MenuItem';
import Menu from '@/components/Menu';

interface BookMenuItemsProps {
  bookKey?: string;
  setIsDropdownOpen?: (isOpen: boolean) => void;
}

export const BookMenuItems: React.FC<BookMenuItemsProps> = ({ bookKey, setIsDropdownOpen }) => {
  const _ = useTranslation();
  // Discord login redirect hooks — disabled for now, uncomment when re-enabling
  // const router = useRouter();
  // const env = useEnv();
  // const auth = useAuth();
  // const settings = useSettingsStore();
  const { bookKeys, getViewSettings, setViewSettings } = useReaderStore();
  const { getBookData } = useBookDataStore();
  const { getVisibleLibrary } = useLibraryStore();
  const { openParallelView } = useBooksManager();
  const { sideBarBookKey, setSideBarBookKey } = useSidebarStore();
  const { parallelViews, setParallel, unsetParallel } = useParallelViewStore();
  const activeBookKey = bookKey ?? sideBarBookKey ?? bookKeys[0];
  const activeBookId = activeBookKey ? getBookIdFromKey(activeBookKey) : undefined;
  const viewSettings = activeBookKey ? getViewSettings(activeBookKey) : undefined;

  const [isSortedTOC, setIsSortedTOC] = React.useState(viewSettings?.sortedTOC || false);

  React.useEffect(() => {
    setIsSortedTOC(viewSettings?.sortedTOC || false);
  }, [viewSettings?.sortedTOC, activeBookKey]);

  const eligibleParallelBooks = getParallelReadMenuBooks(getVisibleLibrary(), activeBookId);

  const handleParallelView = (id: string) => {
    if (activeBookKey) setSideBarBookKey(activeBookKey);
    openParallelView(id, activeBookKey);
    setIsDropdownOpen?.(false);
  };
  const handleReloadPage = () => {
    window.location.reload();
    setIsDropdownOpen?.(false);
  };
  // disabled: About Openread
  // const showAboutOpenread = () => { setAboutDialogVisible(true); setIsDropdownOpen?.(false); };
  // const downloadOpenread = () => { window.open(DOWNLOAD_OPENREAD_URL, '_blank'); setIsDropdownOpen?.(false); };
  const handleExportAnnotations = () => {
    eventDispatcher.dispatch('export-annotations', { bookKey: activeBookKey });
    setIsDropdownOpen?.(false);
  };
  const handleToggleSortTOC = () => {
    if (!activeBookKey) return;
    const newSorted = !isSortedTOC;
    setIsSortedTOC(newSorted);
    setIsDropdownOpen?.(false);

    const nextViewSettings = getViewSettings(activeBookKey)!;
    nextViewSettings.sortedTOC = newSorted;
    setViewSettings(activeBookKey, nextViewSettings);

    // Sort TOC in place instead of recreating the entire viewer
    const bookData = getBookData(activeBookKey);
    const toc = bookData?.bookDoc?.toc;
    if (toc) {
      if (newSorted) {
        sortTocItems(toc);
      } else {
        toc.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
      }
      eventDispatcher.dispatch('toc-updated', { bookKey: activeBookKey });
    }
  };
  const handleSetParallel = () => {
    setParallel(bookKeys);
    setIsDropdownOpen?.(false);
  };
  const handleUnsetParallel = () => {
    unsetParallel(bookKeys);
    setIsDropdownOpen?.(false);
  };
  // disabled: KOReader Sync, Proofread, Discord — can be considered for future
  // const showKoSyncSettingsWindow = () => { setKOSyncSettingsWindowVisible(true); setIsDropdownOpen?.(false); };
  // const showProofreadRulesWindow = () => { setProofreadRulesVisibility(true); setIsDropdownOpen?.(false); };
  // const handlePullKOSync = () => { eventDispatcher.dispatch('pull-kosync', { bookKey: activeBookKey }); setIsDropdownOpen?.(false); };
  // const handlePushKOSync = () => { eventDispatcher.dispatch('push-kosync', { bookKey: activeBookKey }); setIsDropdownOpen?.(false); };
  // const toggleDiscordPresence = () => { ... };

  return (
    <>
      <MenuItem
        label={_('Parallel Read')}
        buttonClass={bookKeys.length > 1 ? 'lg:tooltip lg:tooltip-bottom' : ''}
        tooltip={parallelViews.length > 0 ? _('Disable') : bookKeys.length > 1 ? _('Enable') : ''}
        Icon={parallelViews.length > 0 && bookKeys.length > 1 ? MdCheck : undefined}
        onClick={
          parallelViews.length > 0
            ? handleUnsetParallel
            : bookKeys.length > 1
              ? handleSetParallel
              : undefined
        }
      >
        <ul className='max-h-60 overflow-y-auto'>
          {eligibleParallelBooks.map((book) => (
            <MenuItem
              key={book.hash}
              Icon={
                book.coverImageUrl ? (
                  <Image
                    src={book.coverImageUrl}
                    alt={book.title}
                    width={56}
                    height={80}
                    className='aspect-auto max-h-8 max-w-4 rounded-sm shadow-md'
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : undefined
              }
              label={book.title}
              labelClass='max-w-36'
              onClick={() => handleParallelView(book.hash)}
            />
          ))}
        </ul>
      </MenuItem>
      {bookKeys.length > 1 &&
        (parallelViews.length > 0 ? (
          <MenuItem label={_('Exit Parallel Read')} onClick={handleUnsetParallel} />
        ) : (
          <MenuItem label={_('Enter Parallel Read')} onClick={handleSetParallel} />
        ))}
      {/* KOReader Sync — can be considered for future, now disabled */}
      {/* <hr aria-hidden='true' className='border-base-200 my-1' />
      <MenuItem label={_('KOReader Sync')} onClick={showKoSyncSettingsWindow} />
      {settings.kosync.enabled && (
        <>
          <MenuItem label={_('Push Progress')} onClick={handlePushKOSync} />
          <MenuItem label={_('Pull Progress')} onClick={handlePullKOSync} />
        </>
      )} */}
      {/* Show on Discord — can be considered for future, now disabled */}
      {/* {appService?.isDesktopApp && (
        <>
          <hr aria-hidden='true' className='border-base-200 my-1' />
          <MenuItem
            label={_('Show on Discord')}
            tooltip={_("Display what I'm reading on Discord")}
            toggled={settings.discordRichPresenceEnabled}
            onClick={toggleDiscordPresence}
          />
        </>
      )} */}
      {/* Proofread — can be considered for future, now disabled */}
      {/* <hr aria-hidden='true' className='border-base-200 my-1' />
      <MenuItem label={_('Proofread')} onClick={showProofreadRulesWindow} /> */}
      <hr aria-hidden='true' className='border-base-200 my-1' />
      <MenuItem label={_('Export Annotations')} onClick={handleExportAnnotations} />
      <MenuItem
        label={_('Sort TOC by Page')}
        Icon={isSortedTOC ? MdCheck : undefined}
        onClick={handleToggleSortTOC}
      />
      <MenuItem label={_('Reload Page')} shortcut='Shift+R' onClick={handleReloadPage} />
      {/* About Openread — can be considered for future, now disabled */}
      {/* <hr aria-hidden='true' className='border-base-200 my-1' />
      {isWebAppPlatform() && <MenuItem label={_('Download Openread')} onClick={downloadOpenread} />}
      <MenuItem label={_('About Openread')} onClick={showAboutOpenread} /> */}
    </>
  );
};

interface BookMenuProps extends BookMenuItemsProps {
  menuClassName?: string;
}

const BookMenu: React.FC<BookMenuProps> = ({ bookKey, menuClassName, setIsDropdownOpen }) => {
  return (
    <Menu
      className={clsx('book-menu dropdown-content z-20 shadow-2xl', menuClassName)}
      onCancel={() => setIsDropdownOpen?.(false)}
    >
      <BookMenuItems bookKey={bookKey} setIsDropdownOpen={setIsDropdownOpen} />
    </Menu>
  );
};

export default BookMenu;
