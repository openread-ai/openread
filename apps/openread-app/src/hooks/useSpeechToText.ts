'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

type SpeechRecognitionResultHandler = (text: string) => void;

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<{ 0?: { transcript?: string }; isFinal?: boolean }>;
      }) => void)
    | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const getSpeechRecognitionConstructor = () => {
  if (typeof window === 'undefined') return undefined;
  const speechWindow = window as unknown as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
};

export const appendSpeechText = (currentValue: string, transcript: string) => {
  const trimmedTranscript = transcript.trim();
  if (!trimmedTranscript) return currentValue;

  const trimmedValue = currentValue.trimEnd();
  if (!trimmedValue) return trimmedTranscript;
  return `${trimmedValue} ${trimmedTranscript}`;
};

export const useSpeechToText = () => {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Recognition = useMemo(() => getSpeechRecognitionConstructor(), []);
  const isSupported = !!Recognition;

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const start = useCallback(
    (onTranscript: SpeechRecognitionResultHandler) => {
      if (!Recognition) {
        setError('unsupported');
        return false;
      }

      recognitionRef.current?.abort();
      const recognition = new Recognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        setError(null);
        setIsListening(true);
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        setIsListening(false);
      };
      recognition.onerror = (event) => {
        setError(event.error ?? 'recognition-error');
        setIsListening(false);
      };
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .slice(event.resultIndex)
          .map((result) => result[0]?.transcript ?? '')
          .join(' ')
          .trim();
        if (transcript) onTranscript(transcript);
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
        return true;
      } catch (startError) {
        recognitionRef.current = null;
        setIsListening(false);
        setError(startError instanceof Error ? startError.message : 'start-failed');
        return false;
      }
    },
    [Recognition],
  );

  return { isSupported, isListening, error, start, stop };
};
