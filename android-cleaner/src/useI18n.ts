import { useCallback } from "react";
import { useAppStore } from "./store";
import { translate, type TranslationKey } from "./i18n";

export function useI18n() {
  const language = useAppStore((s) => s.language);
  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(language, key, vars),
    [language],
  );
  return { language, t };
}
