import { useEffect, useState } from "react";
import { Activity, Cpu, MemoryStick, RefreshCw, Thermometer, TriangleAlert } from "lucide-react";
import { api } from "../lib/tauri";
import { useAppStore } from "../store";
import { useI18n } from "../useI18n";
import { formatBytes } from "../lib/format";
import type { HealthSnapshot } from "../types";

export function HealthPage() {
  const device = useAppStore((s) => s.device);
  const setError = useAppStore((s) => s.setError);
  const { t } = useI18n();
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!device) {
      setHealth(null);
      return;
    }
    setLoading(true);
    try {
      setHealth(await api.deviceHealth(device.serial));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [device?.serial]);

  if (!device) {
    return (
      <div className="page">
        <div className="page-head"><div><h1>{t("health.title")}</h1><p>{t("health.subtitle")}</p></div></div>
        <section className="card empty-state tall"><Activity size={34} /><strong>{t("health.noDevice")}</strong></section>
      </div>
    );
  }

  const swapUsedKb = health ? Math.max(0, health.swapTotalKb - health.swapFreeKb) : 0;
  const hot = (health?.thermalStatus ?? 0) > 0 || (health?.skinTempC ?? 0) > 45;
  const pressure = (health?.memAvailableKb ?? Number.MAX_SAFE_INTEGER) < 1_000_000 && swapUsedKb > 1_000_000;

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>{t("health.title")}</h1><p>{t("health.subtitle")}</p></div>
        <button className="btn ghost" onClick={load} disabled={loading}>
          <RefreshCw size={15} className={loading ? "spin" : ""} /> {t("health.refresh")}
        </button>
      </div>

      {health && (
        <>
          <div className="stats-grid four">
            <div className="stat">
              <span className="stat-icon"><Thermometer size={17} /></span>
              <span>{t("health.thermal")}</span>
              <strong>{health.thermalStatus === 0 ? t("health.normal") : t("health.hot")}</strong>
              <small>{health.cpuTempC.toFixed(1)}°C CPU · {health.skinTempC.toFixed(1)}°C {t("health.skin")}</small>
            </div>
            <div className="stat">
              <span className="stat-icon"><Activity size={17} /></span>
              <span>{t("health.load")}</span>
              <strong>{health.load1.toFixed(2)}</strong>
              <small>{t("health.threads", { running: health.runningThreads, total: health.totalThreads })}</small>
            </div>
            <div className="stat">
              <span className="stat-icon"><MemoryStick size={17} /></span>
              <span>{t("health.memory")}</span>
              <strong>{formatBytes(health.memAvailableKb * 1024)}</strong>
              <small>{t("health.available")} · {formatBytes(swapUsedKb * 1024)} {t("health.swap")}</small>
            </div>
            <div className="stat">
              <span className="stat-icon"><Cpu size={17} /></span>
              <span>{t("health.reclaim")}</span>
              <strong>{health.pgstealDirect.toLocaleString()}</strong>
              <small>pswpout {health.pswpout.toLocaleString()}</small>
            </div>
          </div>

          {(hot || pressure) && (
            <div className="warning-box">
              <TriangleAlert size={18} />
              <div>
                {hot && <p>{t("health.hot")}: {health.cpuTempC.toFixed(1)}°C CPU / {health.skinTempC.toFixed(1)}°C {t("health.skin")}</p>}
                {pressure && <p>{t("health.pressure")}: {formatBytes(health.memAvailableKb * 1024)} {t("health.available")}, {formatBytes(swapUsedKb * 1024)} {t("health.swap")}</p>}
              </div>
            </div>
          )}

          <section className="card">
            <div className="card-head">
              <div><h2>{t("health.kills")}</h2><p>{t("health.killsHint")}</p></div>
              <span className="count-badge">{health.kills.length}</span>
            </div>
            {health.kills.length === 0 ? (
              <div className="empty-state small"><p>{t("health.noKills")}</p></div>
            ) : (
              <div className="kill-list">
                {health.kills.slice().reverse().slice(0, 12).map((kill, index) => (
                  <div key={`${kill.timestamp}-${kill.package}-${index}`} className="kill-row">
                    <code>{kill.timestamp}</code>
                    <strong>{kill.package}</strong>
                    <span>{kill.reason}</span>
                    <b>{formatBytes(kill.pssKb * 1024)}</b>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
