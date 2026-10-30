import { useState } from "react";
import { LockKeyhole, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { api } from "../lib/tauri";
import { defaultProtectedPaths, useAppStore } from "../store";
import { useI18n } from "../useI18n";

export function ProtectedPage() {
  const config = useAppStore((s) => s.config);
  const setConfig = useAppStore((s) => s.setConfig);
  const setError = useAppStore((s) => s.setError);
  const { t } = useI18n();
  const [path, setPath] = useState("");
  const [saving, setSaving] = useState(false);

  const persist = async (paths: string[]) => {
    const next = { ...config, protectedPaths: paths };
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

  const add = () => {
    const clean = path.trim().replace(/\/+$/, "");
    if (!clean.startsWith("/storage/emulated/0/")) {
      setError(t("protected.invalid"));
      return;
    }
    if (config.protectedPaths.includes(clean)) {
      setError(t("protected.duplicate"));
      return;
    }
    setPath("");
    void persist([...config.protectedPaths, clean]);
  };

  const remove = (target: string) => {
    void persist(config.protectedPaths.filter((p) => p !== target));
  };

  const reset = () => {
    void persist(defaultProtectedPaths);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("protected.title")}</h1>
          <p>{t("protected.subtitle")}</p>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={reset}><RotateCcw size={15} /> {t("protected.reset")}</button>
          <button className="btn" onClick={() => persist(config.protectedPaths)} disabled={saving}>
            <Save size={15} /> {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2><LockKeyhole size={17} /> {t("protected.prefixes")}</h2>
            <p>{t("protected.hint")}</p>
          </div>
          <span className="count-badge">{config.protectedPaths.length}</span>
        </div>

        <div className="inline-fields add-path">
          <input
            placeholder="/storage/emulated/0/KeepMe"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button className="btn" onClick={add} disabled={!path.trim()}>
            <Plus size={15} /> {t("protected.add")}
          </button>
        </div>

        <div className="protected-list">
          {config.protectedPaths.map((item) => (
            <div key={item} className="protected-row">
              <LockKeyhole size={15} />
              <code>{item}</code>
              <button className="icon-btn danger" onClick={() => remove(item)} aria-label={`${t("protected.prefixes")}: ${item}`}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {config.protectedPaths.length === 0 && <p className="muted">{t("protected.none")}</p>}
        </div>
      </section>

      <section className="card explain">
        <div className="card-head">
          <div>
            <h2>{t("protected.builtIn")}</h2>
            <p>{t("protected.builtInHint")}</p>
          </div>
        </div>
        <div className="safety-grid">
          <div><strong>.nomedia</strong><span>{t("protected.nomedia")}</span></div>
          <div><strong>{t("protected.prefixes")}</strong><span>{t("protected.normalize")}</span></div>
          <div><strong>Fely/</strong><span>{t("protected.lookalike")}</span></div>
          <div><strong>{t("report.protection")}</strong><span>{t("protected.validate")}</span></div>
        </div>
      </section>
    </div>
  );
}
