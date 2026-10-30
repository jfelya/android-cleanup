import { useEffect, useState } from "react";
import { Cpu, FolderOpen, HardDrive, Save, ShieldCheck, Terminal } from "lucide-react";
import { api } from "../lib/tauri";
import { useAppStore } from "../store";
import { useI18n } from "../useI18n";
import { LanguageThemeToggle } from "../components/LanguageThemeToggle";
import { formatBytes } from "../lib/format";
import type { AppInfo } from "../types";

export function SettingsPage() {
  const config = useAppStore((s) => s.config);
  const setConfig = useAppStore((s) => s.setConfig);
  const setError = useAppStore((s) => s.setError);
  const { t } = useI18n();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [capFiles, setCapFiles] = useState(config.duplicateCapFiles);
  const [capGb, setCapGb] = useState(Math.round((config.duplicateCapBytes / 1024 ** 3) * 10) / 10);
  const [trimGb, setTrimGb] = useState(Math.round((config.cacheTrimBytes / 1024 ** 3) * 10) / 10);

  useEffect(() => {
    api.appInfo().then(setInfo).catch((e) => setError(String(e)));
  }, [setError]);

  const save = async () => {
    const next = {
      ...config,
      duplicateCapFiles: Math.max(100, Math.floor(capFiles) || 5000),
      duplicateCapBytes: Math.max(0.1, capGb) * 1024 ** 3,
      cacheTrimBytes: Math.max(0.1, trimGb) * 1024 ** 3,
    };
    setSaving(true);
    try {
      await api.saveConfig(next);
      setConfig(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>{t("settings.title")}</h1><p>{t("settings.subtitle")}</p></div>
        <button className="btn" onClick={save} disabled={saving}><Save size={15} /> {saving ? t("common.saving") : t("common.save")}</button>
      </div>

      <section className="card">
        <div className="card-head"><div><h2>{t("settings.appearance")}</h2><p>{t("settings.appearanceHint")}</p></div></div>
        <LanguageThemeToggle />
      </section>

      <div className="grid two">
        <section className="card">
          <div className="card-head"><div><h2><Terminal size={17} /> {t("settings.runtime")}</h2><p>{t("settings.runtimeHint")}</p></div></div>
          <div className="info-list">
            <div><span>{t("settings.version")}</span><code>{info?.version ?? "…"}</code></div>
            <div><span>{t("settings.adbPath")}</span><code title={info?.adbPath}>{info?.adbPath ?? "…"}</code></div>
            <div><span>{t("settings.dataDir")}</span><code title={info?.dataDir}>{info?.dataDir ?? "…"}</code></div>
            <div><span>{t("settings.webview")}</span><code>{t("settings.systemRuntime")}</code></div>
          </div>
          <button className="btn ghost" onClick={() => api.openDataDir()}><FolderOpen size={15} /> {t("common.openData")}</button>
        </section>

        <section className="card">
          <div className="card-head"><div><h2><HardDrive size={17} /> {t("settings.duplicates")}</h2><p>{t("settings.duplicatesHint")}</p></div></div>
          <label className="switch-line">
            <div><strong>{t("settings.deep")}</strong><span>{t("settings.deepHint")}</span></div>
            <input
              type="checkbox"
              checked={config.deepDuplicates}
              onChange={(e) => setConfig({ ...config, deepDuplicates: e.target.checked })}
            />
          </label>
          <div className="settings-grid">
            <label className="field"><span>{t("settings.maxFiles")}</span><input type="number" min={100} value={capFiles} onChange={(e) => setCapFiles(Number(e.target.value))} /></label>
            <label className="field"><span>{t("settings.maxSize")}</span><input type="number" min={0.1} step={0.5} value={capGb} onChange={(e) => setCapGb(Number(e.target.value))} /></label>
          </div>
          <p className="muted small">{t("settings.currentCap", { size: formatBytes(config.duplicateCapBytes), count: config.duplicateCapFiles.toLocaleString() })}</p>
        </section>
      </div>

      <section className="card">
        <div className="card-head"><div><h2><Cpu size={17} /> {t("settings.cache")}</h2><p>{t("settings.cacheHint")}</p></div></div>
        <label className="switch-line">
          <div><strong>{t("settings.cacheEnable")}</strong><span>{t("settings.cacheEnableHint")}</span></div>
          <input
            type="checkbox"
            checked={config.cacheTrimEnabled}
            onChange={(e) => setConfig({ ...config, cacheTrimEnabled: e.target.checked })}
          />
        </label>
        <div className="settings-grid">
          <label className="field"><span>{t("settings.cacheTarget")}</span><input type="number" min={0.1} step={0.5} value={trimGb} onChange={(e) => setTrimGb(Number(e.target.value))} /></label>
          <div className="field"><span>{t("settings.currentValue")}</span><code>{formatBytes(config.cacheTrimBytes)}</code></div>
        </div>
        <div className="notice warn">
          <ShieldCheck size={16} />
          <span>{t("settings.cacheWarning")}</span>
        </div>
      </section>
    </div>
  );
}
