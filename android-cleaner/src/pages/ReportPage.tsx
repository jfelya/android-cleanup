import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  FolderOpen,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { api } from "../lib/tauri";
import { useAppStore } from "../store";
import { useI18n } from "../useI18n";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { formatBytes, formatCount, formatDateTime, percent, shortPath } from "../lib/format";
import { categoryTranslation, translateWarning } from "../i18n";

export function ReportPage() {
  const dryRun = useAppStore((s) => s.dryRun);
  const device = useAppStore((s) => s.device);
  const execution = useAppStore((s) => s.execution);
  const setExecution = useAppStore((s) => s.setExecution);
  const executing = useAppStore((s) => s.executing);
  const setExecuting = useAppStore((s) => s.setExecuting);
  const cleanupProgress = useAppStore((s) => s.cleanupProgress);
  const setCleanupProgress = useAppStore((s) => s.setCleanupProgress);
  const setError = useAppStore((s) => s.setError);
  const setPage = useAppStore((s) => s.setPage);
  const { language, t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(300);

  useEffect(() => {
    setSelectedPaths(new Set(dryRun?.candidates.map((c) => c.path) ?? []));
    setVisibleCount(300);
  }, [dryRun]);

  const selectedCandidates = useMemo(
    () => (dryRun ? dryRun.candidates.filter((c) => selectedPaths.has(c.path)) : []),
    [dryRun, selectedPaths],
  );
  const selectedBytes = useMemo(
    () => selectedCandidates.reduce((sum, c) => sum + c.size, 0),
    [selectedCandidates],
  );

  const togglePath = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAll = () => {
    if (!dryRun) return;
    setSelectedPaths(new Set(dryRun.candidates.map((c) => c.path)));
  };
  const clearAll = () => setSelectedPaths(new Set());

  const candidates = useMemo(() => {
    if (!dryRun) return [];
    const needle = search.trim().toLowerCase();
    return dryRun.candidates.filter((c) => {
      if (filter !== "all" && c.categoryId !== filter) return false;
      return !needle || c.path.toLowerCase().includes(needle);
    });
  }, [dryRun, search, filter]);

  if (!dryRun) {
    return (
      <div className="page">
        <div className="page-head"><div><h1>{t("report.title")}</h1><p>{t("report.noneHint")}</p></div></div>
        <section className="card empty-state tall">
          <FileText size={34} />
          <strong>{t("report.none")}</strong>
          <p>{t("report.noneHint")}</p>
          <button className="btn" onClick={() => setPage("rules")}>{t("report.goRules")} <ArrowRight size={15} /></button>
        </section>
      </div>
    );
  }

  const execute = async () => {
    if (!device || selectedCandidates.length === 0) return;
    setExecuting(true);
    setCleanupProgress("starting");
    setError(null);
    try {
      const report = await api.executeCleanup(
        device.serial,
        "DELETE",
        selectedCandidates.map((c) => c.path),
        language,
      );
      setExecution(report);
      setConfirmOpen(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setExecuting(false);
    }
  };

  if (execution) {
    return (
      <div className="page">
        <div className="page-head">
          <div><h1>{t("report.complete")}</h1><p>{t("report.completeHint")}</p></div>
          <button className="btn ghost" onClick={() => api.openDataDir()}><FolderOpen size={15} /> {t("common.openData")}</button>
        </div>
        <section className="card result-card">
          <CheckCircle2 size={34} />
          <h2>{t("report.freeAfterLine", { before: formatBytes(execution.beforeFree), after: formatBytes(execution.afterFree) })}</h2>
          <p>
            {t("report.deletedLine", {
              ok: formatCount(execution.files.ok),
              missing: formatCount(execution.files.missing),
              failed: formatCount(execution.files.failed),
              bytes: formatBytes(execution.files.bytes),
            })}
          </p>
          {execution.cacheTrimRequested && (
            <p className="muted">{t("report.cacheRecovered", { bytes: formatBytes(execution.cacheTrimmedBytes) })}</p>
          )}
          <div className="result-paths">
            <span>{t("report.log")} <code>{execution.logPath}</code></span>
            <span>{t("report.report")} <code>{execution.reportPath}</code></span>
          </div>
          <button className="btn" onClick={() => { setExecution(null); setPage("scan"); }}>
            {t("report.scanAgain")} <ArrowRight size={15} />
          </button>
        </section>
      </div>
    );
  }

  const beforeFree = device?.storageFree ?? 0;
  const afterFree = beforeFree + selectedBytes;
  const total = device?.storageTotal ?? 0;
  const maxCat = Math.max(1, ...dryRun.categories.map((c) => c.bytes));
  const allSelected = selectedPaths.size === dryRun.candidates.length;
  const progressLabel =
    cleanupProgress === "starting"
      ? t("report.starting")
      : cleanupProgress === "apps force-stopped"
        ? t("report.appsStopped")
        : cleanupProgress;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("report.title")}</h1>
          <p>{dryRun.id} · {formatDateTime(dryRun.generatedAt)} · {dryRun.serial}</p>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={() => api.openDataDir()}><FolderOpen size={15} /> {t("report.reports")}</button>
          <button className="btn danger" onClick={() => setConfirmOpen(true)} disabled={selectedCandidates.length === 0}>
            <Trash2 size={15} /> {t("report.execute")}
          </button>
        </div>
      </div>

      {dryRun.summary.warnings.length > 0 && (
        <div className="warning-box">
          <TriangleAlert size={18} />
          <div>
            {dryRun.summary.warnings.map((warning) => <p key={warning}>{translateWarning(language, warning)}</p>)}
          </div>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat"><span>{t("report.selectedFiles")}</span><strong>{formatCount(selectedCandidates.length)}</strong><small>{t("report.ofCandidates", { count: formatCount(dryRun.summary.candidateFiles) })}</small></div>
        <div className="stat"><span>{t("report.toRemove")}</span><strong>{formatBytes(selectedBytes)}</strong><small>{t("report.checked")}</small></div>
        <div className="stat"><span>{t("report.duplicates")}</span><strong>{formatBytes(dryRun.summary.duplicateBytes)}</strong><small>{t("report.copies", { count: formatCount(dryRun.summary.duplicateFiles) })}</small></div>
        <div className="stat"><span>{t("report.freeAfter")}</span><strong>{formatBytes(afterFree)}</strong><small>{t("report.percentStorage", { value: percent(afterFree, total).toFixed(1) })}</small></div>
      </div>

      <div className="grid two">
        <section className="card">
          <div className="card-head"><div><h2>{t("report.categories")}</h2><p>{t("report.categoriesHint")}</p></div></div>
          <div className="report-cats">
            {dryRun.categories.filter((c) => c.files > 0).map((category) => {
              const label = categoryTranslation(language, category.id, "label", category.label);
              return (
                <div key={category.id} className="report-cat">
                  <span className={`status-dot ${category.confidence}`} />
                  <div>
                    <strong>{category.id} · {label}</strong>
                    <span>{t("common.filesCount", { count: formatCount(category.files) })}</span>
                  </div>
                  <div className="report-cat-bar"><i style={{ width: `${Math.max(2, (category.bytes / maxCat) * 100)}%` }} /></div>
                  <b>{formatBytes(category.bytes)}</b>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <div className="card-head"><div><h2>{t("report.protection")}</h2><p>{t("report.protectionHint")}</p></div></div>
          <div className="protection-summary">
            <ShieldAlert size={18} />
            <strong>{t("report.prefixes", { count: dryRun.protectedPaths.length })}</strong>
            <p>{t("report.nothingProtected")}</p>
          </div>
          <div className="protected-mini">
            {dryRun.protectedPaths.slice(0, 8).map((path) => <code key={path}>{shortPath(path, 54)}</code>)}
          </div>
          <div className="flow-mini">
            <Sparkles size={15} />
            <span>{t("report.scannedSelected", { scan: formatBytes(dryRun.summary.scanBytes), selected: formatBytes(selectedBytes) })}</span>
          </div>
        </section>
      </div>

      {dryRun.duplicates.length > 0 && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>{t("report.duplicateGroups")}</h2>
              <p>{t("report.duplicateHint")}</p>
            </div>
            <span className="count-badge">{dryRun.duplicates.length}</span>
          </div>
          <div className="dup-list">
            {dryRun.duplicates.slice(0, 30).map((group) => (
              <div key={group.hash} className="dup-row">
                <div>
                  <strong>{formatBytes(group.size)} · {t("report.copiesCount", { count: group.copies.length + 1 })}</strong>
                  <span>{t("report.keep")}: <code>{shortPath(group.keep, 70)}</code></span>
                </div>
                <details>
                  <summary>{t("report.copyList")}</summary>
                  {group.copies.map((path) => <code key={path}>{shortPath(path, 90)}</code>)}
                </details>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <div><h2>{t("report.candidates")}</h2><p>{t("report.matching", { count: formatCount(candidates.length) })}</p></div>
          <div className="table-tools">
            <button className="btn ghost small" onClick={allSelected ? clearAll : selectAll}>
              {allSelected ? t("report.clearAll") : t("report.selectAll")}
            </button>
            <label className="search">
              <Search size={14} />
              <input placeholder={t("report.filter")} value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">{t("report.allCategories")}</option>
              {dryRun.categories.filter((c) => c.files > 0).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} · {categoryTranslation(language, c.id, "label", c.label)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="candidate-table">
          <div className="candidate-head"><span></span><span>{t("report.path")}</span><span>{t("report.category")}</span><span>{t("report.size")}</span></div>
          {candidates.slice(0, visibleCount).map((candidate) => (
            <div key={candidate.path} className="candidate-row">
              <input
                type="checkbox"
                checked={selectedPaths.has(candidate.path)}
                onChange={() => togglePath(candidate.path)}
                aria-label={`${t("report.path")}: ${candidate.path}`}
              />
              <code title={candidate.path}>{shortPath(candidate.path, 95)}</code>
              <span>{candidate.categoryId}</span>
              <b>{formatBytes(candidate.size)}</b>
            </div>
          ))}
          {candidates.length > visibleCount && (
            <div className="table-more">
              <button className="btn ghost small" onClick={() => setVisibleCount((n) => n + 300)}>
                {t("report.loadMore")} ({formatCount(candidates.length - visibleCount)})
              </button>
            </div>
          )}
          {candidates.length === 0 && <div className="table-more">{t("report.noMatch")}</div>}
        </div>
      </section>

      <div className="sticky-actions">
        <span><ShieldAlert size={15} /> {t("report.dryOnly")}</span>
        <button className="btn danger" onClick={() => setConfirmOpen(true)} disabled={selectedCandidates.length === 0}>
          <Trash2 size={15} /> {t("report.execute")}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t("report.confirmTitle")}
        confirmLabel={t("report.confirmDelete")}
        requireText="DELETE"
        busy={executing}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={execute}
      >
        <p>
          {t("report.confirmText", {
            count: formatCount(selectedCandidates.length),
            size: formatBytes(selectedBytes),
            serial: dryRun.serial,
          })}
        </p>
        <p className="muted">{t("report.confirmHint")}</p>
        {executing && <p className="muted">{t("report.working", { progress: progressLabel })}</p>}
      </ConfirmDialog>
    </div>
  );
}
