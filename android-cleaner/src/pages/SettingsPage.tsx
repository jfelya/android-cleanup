import { useEffect, useState } from "react";
import { Cpu, FolderOpen, HardDrive, Plus, Save, ShieldCheck, Terminal, Trash2 } from "lucide-react";
import { api } from "../lib/tauri";
import { useAppStore } from "../store";
import { useI18n } from "../useI18n";
import { LanguageThemeToggle } from "../components/LanguageThemeToggle";
import { formatBytes } from "../lib/format";
import type { AppInfo, CustomRule, DiskStats } from "../types";

export function SettingsPage() {
  const config = useAppStore((s) => s.config);
  const setConfig = useAppStore((s) => s.setConfig);
  const setError = useAppStore((s) => s.setError);
  const device = useAppStore((s) => s.device);
  const { t } = useI18n();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [disk, setDisk] = useState<DiskStats | null>(null);
  const [saving, setSaving] = useState(false);
  const [capFiles, setCapFiles] = useState(config.duplicateCapFiles);
  const [capGb, setCapGb] = useState(Math.round((config.duplicateCapBytes / 1024 ** 3) * 10) / 10);
  const [trimGb, setTrimGb] = useState(Math.round((config.cacheTrimBytes / 1024 ** 3) * 10) / 10);
  const [rules, setRules] = useState<CustomRule[]>(config.customRules);
  const [ruleLabel, setRuleLabel] = useState("");
  const [rulePrefix, setRulePrefix] = useState("");
  const [ruleExt, setRuleExt] = useState("");

  useEffect(() => {
    api.appInfo().then(setInfo).catch((e) => setError(String(e)));
  }, [setError]);

  useEffect(() => {
    if (!device) {
      setDisk(null);
      return;
    }
    api.diskStats(device.serial).then(setDisk).catch(() => setDisk(null));
  }, [device?.serial]);

  const addRule = () => {
    const prefix = rulePrefix.trim().replace(/\/+$/, "");
    if (!prefix.startsWith("/storage/emulated/0/")) {
      setError(t("protected.invalid"));
      return;
    }
    const extensions = ruleExt
      .split(",")
      .map((e) => e.trim().replace(/^\./, "").toLowerCase())
      .filter(Boolean);
    setRules((prev) => [
      ...prev,
      { label: ruleLabel.trim() || prefix.split("/").pop() || "custom", pathPrefix: prefix, extensions },
    ]);
    setRuleLabel("");
    setRulePrefix("");
    setRuleExt("");
  };

  const save = async () => {
    const next = {
      ...config,
      customRules: rules,
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

      <section className="card">
        <div className="card-head">
          <div><h2>{t("settings.customRules")}</h2><p>{t("settings.customHint")}</p></div>
          <span className="count-badge">{rules.length}</span>
        </div>
        <div className="settings-grid custom-rule-form">
          <label className="field"><span>{t("settings.ruleLabel")}</span><input value={ruleLabel} onChange={(e) => setRuleLabel(e.target.value)} /></label>
          <label className="field"><span>{t("settings.rulePrefix")}</span><input placeholder="/storage/emulated/0/MyCache" value={rulePrefix} onChange={(e) => setRulePrefix(e.target.value)} /></label>
          <label className="field"><span>{t("settings.ruleExt")}</span><input placeholder="tmp, log" value={ruleExt} onChange={(e) => setRuleExt(e.target.value)} /></label>
          <button className="btn" onClick={addRule} disabled={!rulePrefix.trim()}><Plus size={15} /> {t("settings.addRule")}</button>
        </div>
        <div className="protected-list">
          {rules.map((rule, index) => (
            <div key={`${rule.pathPrefix}-${index}`} className="protected-row">
              <code>{rule.label} · {rule.pathPrefix}</code>
              <span className="muted small">{rule.extensions.length ? rule.extensions.join(", ") : t("settings.allExtensions")}</span>
              <button className="icon-btn danger" onClick={() => setRules((prev) => prev.filter((_, i) => i !== index))} aria-label={t("common.close")}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {rules.length === 0 && <p className="muted">{t("settings.noRules")}</p>}
        </div>
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
        {disk && (
          <div className="cache-preview">
            <span>{t("settings.cacheNow")}: <b>{formatBytes(disk.appCacheBytes)}</b></span>
            <span>{t("settings.cacheEstimate", { size: formatBytes(Math.min(config.cacheTrimBytes, disk.appCacheBytes)) })}</span>
          </div>
        )}
        <div className="notice warn">
          <ShieldCheck size={16} />
          <span>{t("settings.cacheWarning")}</span>
        </div>
      </section>
    </div>
  );
}
