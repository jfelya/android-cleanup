import { Moon, Sun } from "lucide-react";
import { useAppStore } from "../store";
import { useI18n } from "../useI18n";

export function LanguageThemeToggle() {
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const { t } = useI18n();

  return (
    <div className="ui-toggles">
      <div className="segmented" role="group" aria-label={t("controls.language")}>
        <button
          type="button"
          className={language === "es" ? "active" : ""}
          aria-pressed={language === "es"}
          title={t("language.es")}
          onClick={() => setLanguage("es")}
        >
          ES
        </button>
        <button
          type="button"
          className={language === "en" ? "active" : ""}
          aria-pressed={language === "en"}
          title={t("language.en")}
          onClick={() => setLanguage("en")}
        >
          EN
        </button>
      </div>
      <button
        type="button"
        className="theme-toggle"
        aria-label={`${t("controls.theme")}: ${theme === "dark" ? t("theme.light") : t("theme.dark")}`}
        aria-pressed={theme === "light"}
        title={theme === "dark" ? t("theme.light") : t("theme.dark")}
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        <span>{theme === "dark" ? t("theme.light") : t("theme.dark")}</span>
      </button>
    </div>
  );
}
