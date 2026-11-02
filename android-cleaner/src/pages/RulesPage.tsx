import { useEffect, useMemo, useState } from "react";
import { CheckCheck, FileSearch, Save, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "../lib/tauri";
import { useAppStore } from "../store";
import { useI18n } from "../useI18n";
import { CategoryCard } from "../components/CategoryCard";
import { formatBytes, formatCount } from "../lib/format";
import type { CategorySummary, RuleCategory } from "../types";

export function RulesPage() {
  const config = useAppStore((s) => s.config);
  const setConfig = useAppStore((s) => s.setConfig);
  const scan = useAppStore((s) => s.scan);
  const dryRun = useAppStore((s) => s.dryRun);
  const setDryRun = useAppStore((s) => s.setDryRun);
  const setPage = useAppStore((s) => s.setPage);
  const setError = useAppStore((s) => s.setError);
  const { language, t } = useI18n();
  const [categories, setCategories] = useState<RuleCategory[]>([]);
  const [counts, setCounts] = useState<CategorySummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    api.ruleCategories().then(setCategories).catch((e) => setError(String(e)));
  }, [setError]);

  useEffect(() => {
    if (!scan) {
      setCounts([]);
      return;
    }
    api
      .scanRuleCounts(scan.serial)
      .then(setCounts)
      .catch((e) => setError(String(e)));
  }, [scan?.serial, setError]);

  const summaries: CategorySummary[] = useMemo(
    () =>
      categories.map((category) => {
        const found =
          counts.find((c) => c.id === category.id) ??
          dryRun?.categories.find((c) => c.id === category.id);
        return {
          ...category,
          files: found?.files ?? 0,
          bytes: found?.bytes ?? 0,
          selected: config.enabledCategories.includes(category.id),
        };
      }),
    [categories, counts, dryRun, config.enabledCategories],
  );

  const maxBytes = Math.max(1, ...summaries.map((s) => s.bytes));
  const selected = summaries.filter((s) => s.selected);
  const selectedBytes = selected.reduce((sum, s) => sum + s.bytes, 0);

  const persist = async (next = config) => {
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

  const toggle = (id: string) => {
    const has = config.enabledCategories.includes(id);
    const next = {
      ...config,
      enabledCategories: has
        ? config.enabledCategories.filter((c) => c !== id)
        : [...config.enabledCategories, id],
    };
    setConfig(next);
    void persist(next);
  };

  const applyPreset = (confidence: "safe" | "probable" | "ask" | "all" | "none") => {
    let ids: string[] = [];
    if (confidence === "all") ids = categories.map((c) => c.id);
    else if (confidence === "none") ids = [];
    else ids = categories.filter((c) => c.confidence === confidence).map((c) => c.id);
    const next = { ...config, enabledCategories: ids };
    setConfig(next);
    void persist(next);
  };

  const build = async () => {
    if (!scan) {
      setError(t("rules.needScan"));
      return;
    }
    setBuilding(true);
    setError(null);
    try {
      await api.saveConfig(config);
      const dry = await api.buildDryRun(scan.serial, language);
      setDryRun(dry);
      setPage("report");
    } catch (e) {
      setError(String(e));
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("rules.title")}</h1>
          <p>{t("rules.subtitle")}</p>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={() => applyPreset("safe")}><ShieldCheck size={15} /> {t("rules.safeOnly")}</button>
          <button className="btn ghost" onClick={() => applyPreset("probable")}>{t("rules.probable")}</button>
          <button className="btn ghost" onClick={() => applyPreset("all")}>{t("rules.all")}</button>
          <button className="btn ghost" onClick={() => applyPreset("none")}>{t("rules.clear")}</button>
        </div>
      </div>

      <div className="selection-bar">
        <div>
          <span>{t("rules.selected")}</span>
          <strong>{selected.length} {t("rules.categories")}</strong>
        </div>
        <div>
          <span>{t("rules.estimated")}</span>
          <strong>{formatBytes(selectedBytes)}</strong>
        </div>
        <div>
          <span>{t("rules.lastDry")}</span>
          <strong>{formatCount(selected.reduce((sum, s) => sum + s.files, 0))}</strong>
        </div>
        <div className="selection-actions">
          <button className="btn ghost" onClick={() => persist()} disabled={saving}>
            <Save size={15} /> {saving ? t("common.saving") : t("common.save")}
          </button>
          <button className="btn" onClick={build} disabled={building || !scan}>
            <FileSearch size={15} /> {building ? t("rules.building") : t("rules.build")}
          </button>
        </div>
      </div>

      {!scan && (
        <div className="notice warn">
          <Sparkles size={16} />
          <span>{t("rules.needScan")}</span>
        </div>
      )}

      <div className="category-grid">
        {summaries.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            enabled={category.selected}
            maxBytes={maxBytes}
            onToggle={() => toggle(category.id)}
          />
        ))}
      </div>

      <section className="card explain">
        <div className="card-head">
          <div>
            <h2>{t("rules.confidence")}</h2>
            <p>{t("rules.confidenceHint")}</p>
          </div>
        </div>
        <div className="confidence-grid">
          <div><span className="dot safe" /><strong>{t("confidence.safe")}</strong><p>{t("rules.safeText")}</p></div>
          <div><span className="dot probable" /><strong>{t("confidence.probable")}</strong><p>{t("rules.probableText")}</p></div>
          <div><span className="dot ask" /><strong>{t("confidence.ask")}</strong><p>{t("rules.askText")}</p></div>
        </div>
      </section>

      <div className="sticky-actions">
        <span><CheckCheck size={15} /> {saving ? t("rules.saving") : t("rules.saved")}</span>
        <button className="btn" onClick={build} disabled={building || !scan}>
          {building ? t("rules.building") : t("rules.build")}
        </button>
      </div>
    </div>
  );
}
