import { useEffect, useState } from "react";
import { FileClock, FolderOpen, RefreshCw } from "lucide-react";
import { api } from "../lib/tauri";
import { useAppStore } from "../store";
import { useI18n } from "../useI18n";
import { shortPath } from "../lib/format";

export function LogsPage() {
  const setError = useAppStore((s) => s.setError);
  const { t } = useI18n();
  const [reports, setReports] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setReports(await api.listReports());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("logs.title")}</h1>
          <p>{t("logs.subtitle")}</p>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={load} disabled={loading}><RefreshCw size={15} /> {t("common.refresh")}</button>
          <button className="btn" onClick={() => api.openDataDir()}><FolderOpen size={15} /> {t("common.openData")}</button>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div><h2><FileClock size={17} /> {t("logs.folders")}</h2><p>{t("logs.foldersHint")}</p></div>
          <span className="count-badge">{reports.length}</span>
        </div>
        {reports.length === 0 ? (
          <div className="empty-state small"><p>{t("logs.none")}</p></div>
        ) : (
          <div className="report-list">
            {reports.map((report) => (
              <div key={report} className="report-row">
                <FileClock size={16} />
                <code title={report}>{shortPath(report, 100)}</code>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card explain">
        <div className="card-head"><div><h2>{t("logs.written")}</h2><p>{t("logs.writtenHint")}</p></div></div>
        <div className="safety-grid">
          <div><strong>dry-run.json</strong><span>{t("logs.json")}</span></div>
          <div><strong>candidates.csv</strong><span>{t("logs.csv")}</span></div>
          <div><strong>dry-run.md</strong><span>{t("logs.md")}</span></div>
          <div><strong>logs/&lt;id&gt;.log</strong><span>{t("logs.log")}</span></div>
        </div>
      </section>
    </div>
  );
}
