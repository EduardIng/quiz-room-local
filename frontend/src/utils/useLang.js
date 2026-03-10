/**
 * useLang.js - React hook for i18n
 * Returns [t, lang, setLang] where t(key) returns a translated string.
 */

import { useState, useCallback } from 'react';
import { TRANSLATIONS, getLang, setLang as storeLang } from './i18n.js';

export default function useLang() {
  const [lang, setLangState] = useState(getLang);

  const setLang = useCallback((newLang) => {
    storeLang(newLang);
    setLangState(newLang);
  }, []);

  const t = useCallback((key) => {
    return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.uk[key] ?? key;
  }, [lang]);

  return [t, lang, setLang];
}
