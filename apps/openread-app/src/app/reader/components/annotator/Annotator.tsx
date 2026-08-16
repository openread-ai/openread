import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RiDeleteBinLine } from 'react-icons/ri';

import * as CFI from 'foliate-js/epubcfi.js';
import { Overlayer } from 'foliate-js/overlayer.js';
import { useEnv } from '@/context/EnvContext';
import { BookNote, BooknoteGroup, HighlightColor, HighlightStyle } from '@/types/book';
import { NOTE_PREFIX } from '@/types/view';
import { NativeTouchEventType } from '@/types/system';
import { getLocale, getOSPlatform, makeSafeFilename, uniqueId } from '@/utils/misc';
import { useThemeStore } from '@/store/themeStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useReaderStore } from '@/store/readerStore';
import { useNotebookStore } from '@/store/notebookStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { useDeviceControlStore } from '@/store/deviceStore';
import { useFoliateEvents } from '../../hooks/useFoliateEvents';
import { useNotesSync } from '../../hooks/useNotesSync';
import { useTextSelector } from '../../hooks/useTextSelector';
import { useDesktopContextMenu } from '../../hooks/useDesktopContextMenu';
import { Position, TextSelection } from '@/utils/sel';
import { getPopupPosition, getPosition, getTextFromRange } from '@/utils/sel';
import { eventDispatcher } from '@/utils/event';
import { findTocItemBS } from '@/utils/toc';
import { throttle } from '@/utils/throttle';
import { runSimpleCC } from '@/utils/simplecc';
import { getWordCount } from '@/utils/word';
import { isCfiInLocation } from '@/utils/cfi';
import { TransformContext } from '@/services/transformers/types';
import { transformContent } from '@/services/transformService';
import { getHighlightColorHex } from '../../utils/annotatorUtil';
import { registerNativeMenuBridge } from '@/services/annotation/nativeMenuBridge';
import { bridge } from '@/services/bridge/bridgeService';
import { ANNOTATION_ACTION_EVENT } from '@/services/annotation/menuConfig';
import { parseBookRefFromReaderBookKey } from '@openread/types';
import type { AnnotationActionEvent } from '@/services/annotation/menuConfig';
import { annotationToolButtons } from './AnnotationTools';
import {
  getAnnotationTargetKey,
  getBookNoteTarget,
  getBookNoteTargetKey,
  getBookNoteTextCfi,
  isAnnotationTargetInLocation,
  isAnnotationTargetOnCurrentFixedPage,
  makeAnnotationTargetFromSelection,
  makeTextCfiAnnotationTarget,
} from '@/services/annotation/annotationTargetContract';
import {
  getPdfContextMenuSelectionAction,
  isHighlightActionDisabledForFormat,
  shouldShowWebAnnotationActionsSheetForSelection,
  shouldSuppressWebAnnotationPopupForSelection,
} from '@/services/annotation/selectionMenuContract';
import AnnotationRangeEditor from './AnnotationRangeEditor';
import AnnotationActionsSheet from './AnnotationActionsSheet';
import AnnotationPopup from './AnnotationPopup';
import {
  showNativeColorPicker,
  getViewportCoordsFromRange,
} from '@/services/annotation/nativeMenuBridge';
import WiktionaryPopup from './WiktionaryPopup';
import WikipediaPopup from './WikipediaPopup';
import TranslatorPopup from './TranslatorPopup';
import useShortcuts from '@/hooks/useShortcuts';
import ProofreadPopup from './ProofreadPopup';
import ExportMarkdownDialog from './ExportMarkdownDialog';
import { LAUNCH_TTS_ENABLED, LAUNCH_TRANSLATION_ENABLED } from '@/services/launchFeatures';
import { createLogger } from '@/utils/logger';

const logger = createLogger('annotator');

const Annotator: React.FC<{ bookKey: string }> = ({ bookKey }) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const { settings } = useSettingsStore();
  const { isDarkMode } = useThemeStore();
  const { getConfig, saveConfig, getBookDataByReaderKey, updateBooknotes } = useBookDataStore();
  const { getProgress, getView, getViewsById, getViewSettings } = useReaderStore();
  const { setNotebookVisible, openNotebookForAnnotation } = useNotebookStore();
  const { listenToNativeTouchEvents } = useDeviceControlStore();

  useNotesSync(bookKey);
  const { showNativeMenu, isDesktopTauri } = useDesktopContextMenu();

  const osPlatform = getOSPlatform();
  const config = getConfig(bookKey)!;
  const progress = getProgress(bookKey)!;
  const bookData = getBookDataByReaderKey(bookKey)!;
  const view = getView(bookKey);
  const viewSettings = getViewSettings(bookKey)!;
  const primaryLang = bookData.book?.primaryLanguage || 'en';

  const containerRef = React.useRef<HTMLDivElement>(null);

  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [showAnnotPopup, setShowAnnotPopup] = useState(false);
  const [showAnnotationActionsSheet, setShowAnnotationActionsSheet] = useState(false);
  const [showWiktionaryPopup, setShowWiktionaryPopup] = useState(false);
  const [showWikipediaPopup, setShowWikipediaPopup] = useState(false);
  const [showTranslationPopup, setShowTranslationPopup] = useState(false);
  const [showProofreadPopup, setShowProofreadPopup] = useState(false);
  const [trianglePosition, setTrianglePosition] = useState<Position>();
  const [annotPopupPosition, setAnnotPopupPosition] = useState<Position>();
  const [dictPopupPosition, setDictPopupPosition] = useState<Position>();
  const [translatorPopupPosition, setTranslatorPopupPosition] = useState<Position>();
  const [proofreadPopupPosition, setProofreadPopupPosition] = useState<Position>();
  const [highlightOptionsVisible, setHighlightOptionsVisible] = useState(false);
  const [showAnnotationNotes, setShowAnnotationNotes] = useState(false);
  const [annotationNotes, setAnnotationNotes] = useState<BookNote[]>([]);
  const [editingAnnotation, setEditingAnnotation] = useState<BookNote | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportData, setExportData] = useState<{
    booknotes: BookNote[];
    booknoteGroups: { [href: string]: BooknoteGroup };
  } | null>(null);

  const [selectedStyle, setSelectedStyle] = useState<HighlightStyle>(
    settings.globalReadSettings.highlightStyle,
  );
  const [selectedColor, setSelectedColor] = useState<HighlightColor>(
    settings.globalReadSettings.highlightStyles[selectedStyle],
  );
  const androidTouchEndRef = useRef(false);

  const showingPopup =
    showAnnotPopup ||
    showAnnotationActionsSheet ||
    showWiktionaryPopup ||
    showWikipediaPopup ||
    showTranslationPopup ||
    showProofreadPopup;

  const popupPadding = useResponsiveSize(10);
  const trianglePadding = popupPadding * 2 + 6;
  const maxWidth = window.innerWidth - 2 * popupPadding;
  const maxHeight = window.innerHeight - 2 * popupPadding;
  const dictPopupWidth = Math.min(480, maxWidth);
  const dictPopupHeight = Math.min(300, maxHeight);
  const transPopupWidth = Math.min(480, maxWidth);
  const transPopupHeight = Math.min(265, maxHeight);
  const proofreadPopupWidth = Math.min(440, maxWidth);
  const proofreadPopupHeight = Math.min(200, maxHeight);
  const annotPopupWidth = Math.min(useResponsiveSize(300), maxWidth);
  const annotPopupHeight = useResponsiveSize(44);
  const androidSelectionHandlerHeight = 0;

  // Reposition popups on scroll without dismissing them
  const repositionPopups = useCallback(() => {
    if (!selection || !selection.text) return;
    const gridFrame = document.getElementById(`gridcell-${bookKey}`);
    if (!gridFrame) return;
    const rect = gridFrame.getBoundingClientRect();
    const triangPos = getPosition(selection, rect, trianglePadding, viewSettings.vertical);
    const annotPopupPos = getPopupPosition(
      triangPos,
      rect,
      viewSettings.vertical ? annotPopupHeight : annotPopupWidth,
      viewSettings.vertical ? annotPopupWidth : annotPopupHeight,
      popupPadding,
    );
    if (annotPopupPos.dir === 'down' && osPlatform === 'android') {
      triangPos.point.y += androidSelectionHandlerHeight;
      annotPopupPos.point.y += androidSelectionHandlerHeight;
    }
    const dictPopupPos = getPopupPosition(
      triangPos,
      rect,
      dictPopupWidth,
      dictPopupHeight,
      popupPadding,
    );
    const transPopupPos = getPopupPosition(
      triangPos,
      rect,
      transPopupWidth,
      transPopupHeight,
      popupPadding,
    );
    const proofreadPopupPos = getPopupPosition(
      triangPos,
      rect,
      proofreadPopupWidth,
      proofreadPopupHeight,
      popupPadding,
    );
    if (triangPos.point.x == 0 || triangPos.point.y == 0) return;
    setAnnotPopupPosition(annotPopupPos);
    setDictPopupPosition(dictPopupPos);
    setTranslatorPopupPosition(transPopupPos);
    setProofreadPopupPosition(proofreadPopupPos);
    setTrianglePosition(triangPos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, bookKey, viewSettings.vertical]);

  useEffect(() => {
    setSelectedStyle(settings.globalReadSettings.highlightStyle);
  }, [settings.globalReadSettings.highlightStyle]);

  useEffect(() => {
    setSelectedColor(settings.globalReadSettings.highlightStyles[selectedStyle]);
  }, [settings.globalReadSettings.highlightStyles, selectedStyle]);

  const transformCtx: TransformContext = useMemo(
    () => ({
      bookKey,
      viewSettings: getViewSettings(bookKey)!,
      userLocale: getLocale(),
      content: '',
      transformers: ['punctuation'],
      reversePunctuationTransform: true,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const getAnnotationText = useCallback(
    async (range: Range) => {
      transformCtx['content'] = getTextFromRange(range, primaryLang.startsWith('ja') ? ['rt'] : []);
      return await transformContent(transformCtx);
    },
    [primaryLang, transformCtx],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleDismissPopup = useCallback(
    throttle(() => {
      setSelection(null);
      setShowAnnotPopup(false);
      setShowAnnotationActionsSheet(false);
      setShowWiktionaryPopup(false);
      setShowWikipediaPopup(false);
      setShowTranslationPopup(false);
      setShowProofreadPopup(false);
      setEditingAnnotation(null);
    }, 500),
    [],
  );

  const {
    isTextSelected,
    handleScroll,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handlePointerDown,
    handlePointerMove,
    handlePointerCancel,
    handlePointerUp,
    handleSelectionchange,
    handleShowPopup,
    handleUpToPopup,
    handleContextmenu,
  } = useTextSelector(
    bookKey,
    setSelection,
    getAnnotationText,
    handleDismissPopup,
    isDesktopTauri ? showNativeMenu : undefined,
  );

  const handleDismissPopupAndSelection = () => {
    handleDismissPopup();
    view?.deselect();
    isTextSelected.current = false;
  };

  const onLoad = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    const { doc, index } = detail;

    const handleTouchmove = (ev: TouchEvent) => {
      // Available on iOS, on Android not fired
      // To make the popup not follow the selection while dragging
      setShowAnnotPopup(false);
      setEditingAnnotation(null);
      handleTouchMove(ev);
    };

    const handleNativeTouch = (ev: NativeTouchEventType) => {
      if (ev.type === 'touchstart') {
        androidTouchEndRef.current = false;
        handleTouchStart();
      } else if (ev.type === 'touchend') {
        androidTouchEndRef.current = true;
        handleTouchEnd();
        handlePointerUp(doc, index);
      }
    };

    if (appService?.isAndroidApp) {
      listenToNativeTouchEvents();
      bridge.on('nativeTouch', (event) => handleNativeTouch(event as NativeTouchEventType));
    }

    // Attach generic selection listeners for all formats, including PDF.
    // For PDF we only guarantee Copy & Translate; highlight/annotate may be limited by CFI support.
    view?.renderer?.addEventListener('scroll', handleScroll);
    // Reposition popups on scroll to keep them in view
    view?.renderer?.addEventListener('scroll', () => {
      repositionPopups();
    });
    const opts = { passive: false };
    detail.doc?.addEventListener('touchstart', handleTouchStart, opts);
    detail.doc?.addEventListener('touchmove', handleTouchmove, opts);
    detail.doc?.addEventListener('touchend', handleTouchEnd);
    detail.doc?.addEventListener('pointerdown', handlePointerDown.bind(null, doc, index), opts);
    detail.doc?.addEventListener('pointermove', handlePointerMove.bind(null, doc, index), opts);
    detail.doc?.addEventListener('pointercancel', handlePointerCancel.bind(null, doc, index));
    detail.doc?.addEventListener('pointerup', handlePointerUp.bind(null, doc, index));
    detail.doc?.addEventListener('selectionchange', handleSelectionchange.bind(null, doc, index));

    // For desktop web PDF selections, right-click opens the translator shortcut.
    // Mobile web and native app ownership is delegated to selectionMenuContract.
    if (bookData.book?.format === 'pdf') {
      detail.doc?.addEventListener('contextmenu', (e: Event) => {
        const pointerType =
          'pointerType' in e && typeof (e as PointerEvent).pointerType === 'string'
            ? (e as PointerEvent).pointerType
            : null;
        const action = getPdfContextMenuSelectionAction({
          appService,
          pointerType,
          hasDesktopNativeMenu: Boolean(showNativeMenu),
        });
        if (action === 'allow-native') return;

        try {
          const sel = doc.getSelection?.();
          if (sel && !sel.isCollapsed) {
            const range = sel.getRangeAt(0);
            const text = sel.toString();
            if (text.trim()) {
              const cfi = view?.getCFI(index, range);
              setSelection({
                key: bookKey,
                text,
                range,
                index,
                target:
                  makeAnnotationTargetFromSelection({
                    format: bookData.book?.format,
                    cfi,
                    range,
                    index,
                    text,
                  }) ?? undefined,
                cfi,
              });
              if (action === 'open-translation') {
                setShowAnnotPopup(false);
                setShowTranslationPopup(true);
                setShowWiktionaryPopup(false);
                setShowWikipediaPopup(false);
              }
            }
          }
        } catch (err) {
          logger.warn('PDF context menu selection handling failed', err);
        }
        e.preventDefault();
        e.stopPropagation();
        return false;
      });
    }

    // Apply the shared owner contract: allow native/iOS web menus, suppress only OpenRead-owned touch menus.
    detail.doc?.addEventListener('contextmenu', handleContextmenu);
  };

  const onDrawAnnotation = (event: Event) => {
    const viewSettings = getViewSettings(bookKey)!;
    const isBwEink = viewSettings.isEink && !viewSettings.isColorEink;
    const detail = (event as CustomEvent).detail;
    const { draw, annotation, doc, range } = detail;
    const { style, color } = annotation as BookNote;
    const hexColor = getHighlightColorHex(settings, color);
    const einkBgColor = isDarkMode ? '#000000' : '#ffffff';
    const einkFgColor = isDarkMode ? '#ffffff' : '#000000';
    if (annotation.note) {
      const { defaultView } = doc;
      const node = range.startContainer;
      const el = node.nodeType === 1 ? node : node.parentElement;
      const { writingMode } = defaultView.getComputedStyle(el);
      draw(Overlayer.bubble, { writingMode });
    } else if (style === 'highlight') {
      draw(Overlayer.highlight, { color: isBwEink ? einkBgColor : hexColor });
    } else if (['underline', 'squiggly'].includes(style as string)) {
      const { defaultView } = doc;
      const node = range.startContainer;
      const el = node.nodeType === 1 ? node : node.parentElement;
      const { writingMode, lineHeight, fontSize } = defaultView.getComputedStyle(el);
      const fontSizeValue = parseFloat(fontSize) || viewSettings.defaultFontSize;
      const lineHeightValue = parseFloat(lineHeight) || viewSettings.lineHeight * fontSizeValue;
      const strokeWidth = 2;
      const verticalCompensation = appService?.isMobile ? 0 : -1;
      const horizontalCompensation = appService?.isMobile ? -1 : 0;
      const padding = viewSettings.vertical
        ? (lineHeightValue - fontSizeValue) / 2 - strokeWidth + verticalCompensation
        : (lineHeightValue - fontSizeValue) / 2 - strokeWidth + horizontalCompensation;
      draw(Overlayer[style as keyof typeof Overlayer], {
        writingMode,
        color: isBwEink ? einkFgColor : hexColor,
        padding,
      });
    }
  };

  const onShowAnnotation = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    const { value, index, range } = detail;
    const { booknotes = [] } = getConfig(bookKey)!;
    const isNote = value.startsWith(NOTE_PREFIX);
    const cfi = isNote ? value.replace(NOTE_PREFIX, '') : undefined;
    const annotations = booknotes.filter((booknote) => {
      if (booknote.type !== 'annotation' || booknote.deletedAt) return false;
      const noteTarget = getBookNoteTarget(booknote);
      return (
        getAnnotationTargetKey(noteTarget) === value ||
        getBookNoteTextCfi(booknote) === (cfi ?? value)
      );
    });
    const annotation = annotations.find(
      (annotation) => (!isNote && annotation.style) || (isNote && annotation.note),
    );
    if (!annotation) return;

    const target =
      getBookNoteTarget(annotation) ?? (cfi ? makeTextCfiAnnotationTarget({ cfi, index }) : null);
    if (!target) return;
    const textCfi = getBookNoteTextCfi(annotation) ?? cfi;
    const { style, color, text, note } = annotation;
    const selection = {
      key: bookKey,
      annotated: true,
      text: text ?? '',
      note: note ?? '',
      rect: isNote ? detail.rect : undefined,
      target,
      cfi: textCfi,
      range,
      index,
    };
    if (isNote) {
      setShowAnnotationNotes(true);
      setHighlightOptionsVisible(false);
      setEditingAnnotation(null);
    } else {
      setShowAnnotationNotes(false);
      setAnnotationNotes([]);
      if (style && color) {
        setSelectedStyle(style);
        setSelectedColor(color);
      }
      if (style && range) {
        setEditingAnnotation(annotation);
      }
    }
    setSelection(selection);
    handleUpToPopup();
  };

  useFoliateEvents(view, { onLoad, onDrawAnnotation, onShowAnnotation });

  useEffect(() => {
    handleShowPopup(showingPopup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingPopup]);

  // When popups are visible, update their positions on scroll events
  useEffect(() => {
    const view = getView(bookKey);
    if (!view?.renderer) return;
    const onScroll = () => {
      if (showingPopup) {
        repositionPopups();
      }
    };
    view.renderer.addEventListener('scroll', onScroll);
    return () => {
      view.renderer.removeEventListener('scroll', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookKey, showingPopup, repositionPopups]);

  useEffect(() => {
    eventDispatcher.on('export-annotations', handleExportMarkdown);
    return () => {
      eventDispatcher.off('export-annotations', handleExportMarkdown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Register native menu bridge so iOS/Android text-selection actions reach the typed bridge.
  useEffect(() => {
    registerNativeMenuBridge();
  }, []);

  const handleQuickAction = () => {
    const action = viewSettings.annotationQuickAction;
    if (appService?.isAndroidApp && !androidTouchEndRef.current) return;
    switch (action) {
      case 'copy':
        handleCopy(false);
        handleDismissPopupAndSelection();
        break;
      case 'highlight':
        // highlight is already applied in instant annotating
        handleDismissPopupAndSelection();
        break;
      case 'search':
        handleSearch();
        break;
      case 'dictionary':
        handleDictionary();
        break;
      case 'wikipedia':
        handleWikipedia();
        break;
      case 'translate':
        if (LAUNCH_TRANSLATION_ENABLED) handleTranslation();
        break;
      case 'tts':
        if (LAUNCH_TTS_ENABLED) handleSpeakText(true);
        break;
    }
  };

  useEffect(() => {
    setHighlightOptionsVisible(!!(selection && selection.annotated));
    if (selection && selection.text.trim().length > 0) {
      const gridFrame = document.getElementById(`gridcell-${bookKey}`);
      if (!gridFrame) return;
      const rect = gridFrame.getBoundingClientRect();
      const triangPos = getPosition(selection, rect, trianglePadding, viewSettings.vertical);
      const annotPopupPos = getPopupPosition(
        triangPos,
        rect,
        viewSettings.vertical ? annotPopupHeight : annotPopupWidth,
        viewSettings.vertical ? annotPopupWidth : annotPopupHeight,
        popupPadding,
      );
      if (annotPopupPos.dir === 'down' && osPlatform === 'android') {
        triangPos.point.y += androidSelectionHandlerHeight;
        annotPopupPos.point.y += androidSelectionHandlerHeight;
      }
      const dictPopupPos = getPopupPosition(
        triangPos,
        rect,
        dictPopupWidth,
        dictPopupHeight,
        popupPadding,
      );
      const transPopupPos = getPopupPosition(
        triangPos,
        rect,
        transPopupWidth,
        transPopupHeight,
        popupPadding,
      );
      const proofreadPopupPos = getPopupPosition(
        triangPos,
        rect,
        proofreadPopupWidth,
        proofreadPopupHeight,
        popupPadding,
      );
      if (triangPos.point.x == 0 || triangPos.point.y == 0) return;
      setAnnotPopupPosition(annotPopupPos);
      setDictPopupPosition(dictPopupPos);
      setTranslatorPopupPosition(transPopupPos);
      setProofreadPopupPosition(proofreadPopupPos);
      setTrianglePosition(triangPos);

      const { enableAnnotationQuickActions, annotationQuickAction } = viewSettings;
      if (enableAnnotationQuickActions && annotationQuickAction && isTextSelected.current) {
        // On mobile, always show the popup menu — users expect a choice
        // before an action is applied (Apple HIG: action sheets for choices).
        if (appService?.isMobile) {
          handleShowAnnotPopup();
        } else {
          handleQuickAction();
        }
      } else {
        handleShowAnnotPopup();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, bookKey]);

  useEffect(() => {
    if (!progress) return;
    const { location } = progress;
    const { booknotes = [] } = config;
    const isBooknoteInCurrentLocation = (item: BookNote) => {
      const target = getBookNoteTarget(item);
      return (
        isAnnotationTargetInLocation(target, location) ||
        isAnnotationTargetOnCurrentFixedPage(target, progress) ||
        isCfiInLocation(getBookNoteTextCfi(item), location)
      );
    };
    const annotations = booknotes.filter(
      (item) =>
        !item.deletedAt &&
        item.type === 'annotation' &&
        item.style &&
        isBooknoteInCurrentLocation(item),
    );
    const notes = booknotes.filter(
      (item) =>
        !item.deletedAt &&
        item.type === 'annotation' &&
        item.note &&
        item.note.trim().length > 0 &&
        isBooknoteInCurrentLocation(item),
    );
    try {
      Promise.all(annotations.map((annotation) => view?.addAnnotation(annotation)));
      Promise.all(
        notes.map((note) => {
          const cfi = getBookNoteTextCfi(note);
          return cfi ? view?.addAnnotation({ ...note, cfi, value: `${NOTE_PREFIX}${cfi}` }) : null;
        }),
      );
    } catch (e) {
      logger.warn('Failed to add annotations', e);
    }
    // Re-run when progress changes (page navigation) or when booknotes update
    // (synced highlights from another device). addAnnotation is idempotent (keyed
    // by CFI), so duplicate adds on the same page are safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, config.booknotes]);

  useEffect(() => {
    const selectionCfi = selection ? getBookNoteTextCfi(selection) : null;
    if (!config.booknotes || !selectionCfi || !showAnnotationNotes) return;
    const annotations = config.booknotes.filter(
      (booknote) =>
        booknote.type === 'annotation' &&
        !booknote.deletedAt &&
        getBookNoteTextCfi(booknote) === selectionCfi,
    );
    const notes = annotations.filter((item) => item.note && item.note.trim().length > 0);
    setAnnotationNotes(notes);
  }, [selection, showAnnotationNotes, config.booknotes]);

  const handleShowAnnotPopup = () => {
    // On iOS, show the native UIKit color picker when tapping existing highlights.
    // Compute viewport-relative coords from the selection range's bounding rect.
    if (appService?.isIOSApp) {
      if (selection?.annotated && selection.range) {
        const { x, y } = getViewportCoordsFromRange(selection.range);
        showNativeColorPicker(x, y, selectedColor, true);
      }
      return;
    }
    // iOS/iPadOS mobile web keeps Safari selection ownership, but OpenRead
    // still provides actions through a separate non-overlapping dock.
    if (shouldShowWebAnnotationActionsSheetForSelection({ appService, selection })) {
      containerRef.current?.focus();
      setShowAnnotationActionsSheet(true);
      setShowAnnotPopup(false);
      setShowTranslationPopup(false);
      setShowWiktionaryPopup(false);
      setShowWikipediaPopup(false);
      return;
    }

    // Native app new selections are owned by their platform menu; Android mobile
    // web and desktop web/Tauri remain OpenRead-owned through the anchored popup.
    if (shouldSuppressWebAnnotationPopupForSelection({ appService, selection })) return;

    containerRef.current?.focus();
    setShowAnnotationActionsSheet(false);
    setShowAnnotPopup(true);
    setShowTranslationPopup(false);
    setShowWiktionaryPopup(false);
    setShowWikipediaPopup(false);
  };

  const handleCopy = (dismissPopup = true) => {
    if (!selection || !selection.text) return;
    setTimeout(() => {
      // Delay to ensure it won't be overridden by system clipboard actions
      navigator.clipboard?.writeText(selection.text);
    }, 100);
    if (dismissPopup) {
      handleDismissPopupAndSelection();
    }

    if (!viewSettings?.copyToNotebook) return;

    eventDispatcher.dispatch('toast', {
      type: 'info',
      message: _('Copied to notebook'),
      className: 'whitespace-nowrap',
      timeout: 2000,
    });

    const { booknotes: annotations = [] } = config;
    const cfi = view?.getCFI(selection.index, selection.range);
    const target =
      selection.target ??
      makeAnnotationTargetFromSelection({
        format: bookData.book?.format,
        cfi,
        range: selection.range,
        index: selection.index,
        text: selection.text,
      });
    if (!target) return;
    const targetKey = getAnnotationTargetKey(target);
    const annotation: BookNote = {
      id: uniqueId(),
      type: 'excerpt',
      target,
      ...(target.kind === 'text-cfi' ? { cfi: target.cfi } : {}),
      text: selection.text,
      note: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const existingIndex = annotations.findIndex(
      (annotation) =>
        getAnnotationTargetKey(getBookNoteTarget(annotation)) === targetKey &&
        annotation.type === 'excerpt' &&
        !annotation.deletedAt,
    );
    if (existingIndex !== -1) {
      annotations[existingIndex] = annotation;
    } else {
      annotations.push(annotation);
    }
    const updatedConfig = updateBooknotes(bookKey, annotations);
    if (updatedConfig) {
      saveConfig(envConfig, bookKey, updatedConfig, settings);
    }
    if (!appService?.isMobile) {
      setNotebookVisible(true);
    }
  };

  const handleHighlight = (
    update = false,
    highlightStyle?: HighlightStyle,
    highlightColor?: HighlightColor,
  ) => {
    if (!selection || !selection.text) return;
    setHighlightOptionsVisible(true);
    const { booknotes: annotations = [] } = config;
    const cfi = view?.getCFI(selection.index, selection.range);
    const target =
      selection.target ??
      makeAnnotationTargetFromSelection({
        format: bookData.book?.format,
        cfi,
        range: selection.range,
        index: selection.index,
        text: selection.text,
      });
    if (!target) return;
    const targetKey = getAnnotationTargetKey(target);
    const style = highlightStyle || settings.globalReadSettings.highlightStyle;
    const color = highlightColor || settings.globalReadSettings.highlightStyles[style];
    const annotation: BookNote = {
      id: uniqueId(),
      type: 'annotation',
      target,
      ...(target.kind === 'text-cfi' ? { cfi: target.cfi } : {}),
      style,
      color,
      text: selection.text,
      note: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const existingIndex = annotations.findIndex(
      (annotation) =>
        getAnnotationTargetKey(getBookNoteTarget(annotation)) === targetKey &&
        annotation.type === 'annotation' &&
        annotation.style &&
        !annotation.deletedAt,
    );
    const bookRef = parseBookRefFromReaderBookKey(bookKey);
    if (!bookRef) return;
    const views = getViewsById(bookRef);
    if (existingIndex !== -1) {
      views.forEach((view) => view?.addAnnotation(annotation, true));
      if (update) {
        annotation.id = annotations[existingIndex]!.id;
        annotations[existingIndex] = annotation;
        views.forEach((view) => view?.addAnnotation(annotation));
      } else {
        const now = Date.now();
        annotations[existingIndex]!.deletedAt = now;
        annotations[existingIndex]!.updatedAt = now;
        handleDismissPopup();
      }
    } else {
      annotations.push(annotation);
      views.forEach((view) => view?.addAnnotation(annotation));
      setSelection({
        ...selection,
        target,
        cfi: target.kind === 'text-cfi' ? target.cfi : cfi,
        annotated: true,
      });
    }

    const updatedConfig = updateBooknotes(bookKey, annotations);
    if (updatedConfig) {
      saveConfig(envConfig, bookKey, updatedConfig, settings);
    }
  };

  const handleAnnotate = () => {
    if (!selection || !selection.text) return;
    const { sectionHref: href } = progress;
    selection.href = href;
    handleHighlight(true);
    openNotebookForAnnotation(selection);
    handleDismissPopup();
  };

  const handleSearch = () => {
    if (!selection || !selection.text) return;
    handleDismissPopupAndSelection();

    let term = selection.text;
    const convertChineseVariant = viewSettings.convertChineseVariant;
    if (convertChineseVariant && convertChineseVariant !== 'none') {
      term = runSimpleCC(term, convertChineseVariant, true);
    }
    eventDispatcher.dispatch('search-term', { term, bookKey });
  };

  const handleDictionary = () => {
    if (!selection || !selection.text) return;
    setShowAnnotPopup(false);
    setShowWiktionaryPopup(true);
  };

  const handleWikipedia = () => {
    if (!selection || !selection.text) return;
    setShowAnnotPopup(false);
    setShowWikipediaPopup(true);
  };

  // Ref holds the latest handlers so the event listener never goes stale.
  const annotationHandlersRef = useRef({
    handleHighlight,
    handleAnnotate,
    handleSearch,
    handleWikipedia,
  });
  annotationHandlersRef.current = {
    handleHighlight,
    handleAnnotate,
    handleSearch,
    handleWikipedia,
  };

  // Listen for annotation actions from native menus (iOS/Android) and
  // platform context menus (desktop Tauri).
  useEffect(() => {
    const handleAnnotationAction = (event: CustomEvent) => {
      const { action, color, style } = event.detail as AnnotationActionEvent;
      const h = annotationHandlersRef.current;
      switch (action) {
        case 'highlight':
          h.handleHighlight(true, style, color);
          // On iOS, show the native UIKit color picker after highlighting.
          // Use selection range to get viewport-relative coords.
          if (appService?.isIOSApp && selection) {
            setTimeout(() => {
              const { x, y } = getViewportCoordsFromRange(selection.range);
              showNativeColorPicker(x, y, color || selectedColor, false);
            }, 100);
          }
          break;
        case 'annotate':
          h.handleAnnotate();
          break;
        case 'search':
          h.handleSearch();
          break;
        case 'wikipedia':
          h.handleWikipedia();
          break;
        case 'remove-highlight':
          h.handleHighlight(false);
          break;
      }
    };

    eventDispatcher.on(ANNOTATION_ACTION_EVENT, handleAnnotationAction);
    return () => {
      eventDispatcher.off(ANNOTATION_ACTION_EVENT, handleAnnotationAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTranslation = () => {
    if (!LAUNCH_TRANSLATION_ENABLED || !selection || !selection.text) return;
    setShowAnnotPopup(false);
    setShowTranslationPopup(true);
  };

  const handleSpeakText = async (oneTime = false) => {
    if (!LAUNCH_TTS_ENABLED || !selection || !selection.text) return;
    setShowAnnotPopup(false);
    eventDispatcher.dispatch('tts-speak', { bookKey, range: selection.range, oneTime });
  };

  const handleProofread = () => {
    if (!selection || !selection.text) return;
    setShowAnnotPopup(false);
    setShowProofreadPopup(true);

    if (getWordCount(selection.text) > 30) {
      eventDispatcher.dispatch('toast', {
        type: 'warning',
        message: _('Word limit of 30 words exceeded.'),
        timeout: 3000,
      });
      return;
    }
  };

  const handleStartEditAnnotation = useCallback(() => {
    setShowAnnotPopup(false);
  }, []);

  // Keyboard shortcuts: trigger actions only if there's an active selection and popup hidden
  useShortcuts(
    {
      onHighlightSelection: () => {
        handleHighlight(false, 'highlight');
      },
      onUnderlineSelection: () => {
        handleHighlight(false, 'underline');
      },
      onAnnotateSelection: () => {
        handleAnnotate();
      },
      onSearchSelection: () => {
        handleSearch();
      },
      onCopySelection: () => {
        handleCopy(false);
      },
      onTranslateSelection: () => {
        if (LAUNCH_TRANSLATION_ENABLED) handleTranslation();
      },
      onDictionarySelection: () => {
        handleDictionary();
      },
      onWikipediaSelection: () => {
        handleWikipedia();
      },
      onReadAloudSelection: () => {
        if (LAUNCH_TTS_ENABLED) handleSpeakText();
      },
      onProofreadSelection: () => {
        handleProofread();
      },
    },
    [selection?.text],
  );

  const handleExportMarkdown = async (event: CustomEvent) => {
    const { bookKey: exportBookKey } = event.detail;
    if (bookKey !== exportBookKey) return;

    const { bookDoc, book } = bookData;
    if (!bookDoc || !book || !bookDoc.toc) return;

    const config = getConfig(bookKey)!;
    const { booknotes: allNotes = [] } = config;
    const booknotes = allNotes.filter((note) => !note.deletedAt);
    if (booknotes.length === 0) {
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('No annotations to export'),
        className: 'whitespace-nowrap',
        timeout: 2000,
      });
      return;
    }

    // Organize booknotes into groups by chapter
    const booknoteGroups: { [href: string]: BooknoteGroup } = {};
    for (const booknote of booknotes) {
      const cfi = getBookNoteTextCfi(booknote);
      const tocItem: ReturnType<typeof findTocItemBS> = cfi
        ? findTocItemBS(bookDoc.toc ?? [], cfi)
        : null;
      const href = tocItem?.href || '';
      const label = tocItem?.label || '';
      const id = tocItem?.id || 0;
      if (!booknoteGroups[href]) {
        booknoteGroups[href] = { id, href, label, booknotes: [] };
      }
      booknoteGroups[href].booknotes.push(booknote);
    }

    Object.values(booknoteGroups).forEach((group) => {
      group.booknotes.sort((a, b) => {
        const aCfi = getBookNoteTextCfi(a);
        const bCfi = getBookNoteTextCfi(b);
        if (aCfi && bCfi) return CFI.compare(aCfi, bCfi);
        return getBookNoteTargetKey(a).localeCompare(getBookNoteTargetKey(b));
      });
    });

    setExportData({ booknotes, booknoteGroups });
    setShowExportDialog(true);
  };

  const handleConfirmExport = async (markdownContent: string) => {
    const { book } = bookData;
    if (!book) return;

    setTimeout(() => {
      // Delay to ensure it won't be overridden by system clipboard actions
      navigator.clipboard?.writeText(markdownContent);
    }, 100);

    const filename = `${makeSafeFilename(book.title)}.md`;
    const saved = await appService?.saveFile(filename, markdownContent, 'text/markdown');
    eventDispatcher.dispatch('toast', {
      type: 'info',
      message: saved ? _('Exported successfully') : _('Copied to clipboard'),
      timeout: 2000,
    });

    setShowExportDialog(false);
    setExportData(null);
  };

  const handleCancelExport = () => {
    setShowExportDialog(false);
    setExportData(null);
  };

  const selectionAnnotated = selection?.annotated;
  const toolButtons = annotationToolButtons.map(({ type, label, Icon }) => {
    switch (type) {
      case 'copy':
        return { tooltipText: _(label), Icon, onClick: handleCopy };
      case 'highlight':
        return {
          tooltipText: selectionAnnotated ? _('Delete Highlight') : _(label),
          Icon: selectionAnnotated ? RiDeleteBinLine : Icon,
          onClick: handleHighlight,
          disabled: isHighlightActionDisabledForFormat(bookData.book?.format),
        };
      case 'annotate':
        return {
          tooltipText: _(label),
          Icon,
          onClick: handleAnnotate,
          disabled: bookData.book?.format === 'pdf',
        };
      case 'search':
        return {
          tooltipText: _(label),
          Icon,
          onClick: handleSearch,
          disabled: bookData.book?.format === 'pdf',
        };
      case 'dictionary':
        return { tooltipText: _(label), Icon, onClick: handleDictionary };
      case 'wikipedia':
        return { tooltipText: _(label), Icon, onClick: handleWikipedia };
      case 'translate':
        return { tooltipText: _(label), Icon, onClick: handleTranslation };
      case 'tts':
        return {
          tooltipText: _(label),
          Icon,
          onClick: handleSpeakText,
          disabled: bookData.book?.format === 'pdf',
        };
      case 'proofread':
        return {
          tooltipText: _(label),
          Icon,
          onClick: handleProofread,
          disabled: bookData.book?.format !== 'epub',
        };
      default:
        return { tooltipText: '', Icon, onClick: () => {} };
    }
  });

  return (
    <div ref={containerRef} role='toolbar' tabIndex={-1}>
      {showWiktionaryPopup && trianglePosition && dictPopupPosition && (
        <WiktionaryPopup
          word={selection?.text as string}
          lang={bookData.bookDoc?.metadata.language as string}
          position={dictPopupPosition}
          trianglePosition={trianglePosition}
          popupWidth={dictPopupWidth}
          popupHeight={dictPopupHeight}
          onDismiss={handleDismissPopupAndSelection}
        />
      )}
      {showWikipediaPopup && trianglePosition && dictPopupPosition && (
        <WikipediaPopup
          text={selection?.text as string}
          lang={bookData.bookDoc?.metadata.language as string}
          position={dictPopupPosition}
          trianglePosition={trianglePosition}
          popupWidth={dictPopupWidth}
          popupHeight={dictPopupHeight}
          onDismiss={handleDismissPopupAndSelection}
        />
      )}
      {LAUNCH_TRANSLATION_ENABLED &&
        showTranslationPopup &&
        trianglePosition &&
        translatorPopupPosition && (
          <TranslatorPopup
            text={selection?.text as string}
            position={translatorPopupPosition}
            trianglePosition={trianglePosition}
            popupWidth={transPopupWidth}
            popupHeight={transPopupHeight}
            onDismiss={handleDismissPopupAndSelection}
          />
        )}
      {showAnnotationActionsSheet && selection && (
        <AnnotationActionsSheet buttons={toolButtons} onDismiss={handleDismissPopupAndSelection} />
      )}
      {showAnnotPopup && trianglePosition && annotPopupPosition && (
        <AnnotationPopup
          bookKey={bookKey}
          dir={viewSettings.rtl ? 'rtl' : 'ltr'}
          isVertical={viewSettings.vertical}
          buttons={toolButtons}
          notes={annotationNotes}
          position={annotPopupPosition}
          trianglePosition={trianglePosition}
          highlightOptionsVisible={highlightOptionsVisible}
          selectedStyle={selectedStyle}
          selectedColor={selectedColor}
          popupWidth={annotPopupWidth}
          popupHeight={annotPopupHeight}
          onHighlight={handleHighlight}
          onDismiss={handleDismissPopupAndSelection}
        />
      )}
      {showProofreadPopup && trianglePosition && proofreadPopupPosition && selection && (
        <ProofreadPopup
          bookKey={bookKey}
          selection={selection}
          position={proofreadPopupPosition}
          trianglePosition={trianglePosition}
          popupWidth={proofreadPopupWidth}
          popupHeight={proofreadPopupHeight}
          onDismiss={handleDismissPopupAndSelection}
        />
      )}
      {editingAnnotation && editingAnnotation.color && selection && (
        <AnnotationRangeEditor
          bookKey={bookKey}
          isVertical={viewSettings.vertical}
          annotation={editingAnnotation}
          selection={selection}
          handleColor={selectedColor}
          getAnnotationText={getAnnotationText}
          setSelection={setSelection}
          onStartEdit={handleStartEditAnnotation}
        />
      )}
      {showExportDialog && exportData && bookData.book && (
        <ExportMarkdownDialog
          bookKey={bookKey}
          isOpen={showExportDialog}
          bookTitle={bookData.book.title}
          bookAuthor={bookData.book.author || ''}
          booknotes={exportData.booknotes}
          booknoteGroups={exportData.booknoteGroups}
          onCancel={handleCancelExport}
          onExport={handleConfirmExport}
        />
      )}
    </div>
  );
};

export default Annotator;
