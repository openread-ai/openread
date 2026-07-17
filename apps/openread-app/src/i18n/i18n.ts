import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpApi from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';
import { options } from '../../i18next-scanner.config';
import { createLogger } from '@/utils/logger';

const logger = createLogger('i18n');

const isBrowser = typeof window !== 'undefined';

const configuredI18n = i18n.use(LanguageDetector).use(initReactI18next);
if (isBrowser) configuredI18n.use(HttpApi);

void configuredI18n.init({
  supportedLngs: ['en', ...options.lngs],
  fallbackLng: {
    'zh-HK': ['zh-TW', 'en'],
    kk: ['ru', 'en'],
    ky: ['ru', 'en'],
    tk: ['ru', 'en'],
    uz: ['ru', 'en'],
    ug: ['ru', 'en'],
    tt: ['ru', 'en'],
    default: ['en'],
  },
  ns: options.ns,
  defaultNS: options.defaultNs,
  ...(isBrowser && {
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
  }),
  detection: {
    order: ['querystring', 'localStorage', 'navigator'],
    caches: ['localStorage'],
  },
  keySeparator: false,
  nsSeparator: false,
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

i18n.on('languageChanged', (lng) => {
  logger.info('Language changed to', lng);
});

export default i18n;
