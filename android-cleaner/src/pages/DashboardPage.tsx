import { ArrowRight, Database, FileStack, HardDrive, ShieldCheck, Sparkles } from "lucide-react";
import { useAppStore } from "../store";
import { useI18n } from "../useI18n";
import { DeviceCard } from "../components/DeviceCard";
import { StorageRing } from "../components/StorageRing";
import { Treemap } from "../components/Treemap";
import { formatBytes, formatCount, percent } from "../lib/format";

export function DashboardPage() {
  const device = useAppStore((s) => s.device);
  const scan = useAppStore((s) => s.scan);
  const dryRun = useAppStore((s) => s.dryRun);
  const setPage = useAppStore((s) => s.setPage);
  const { t } = useI18n();

  if (!device) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t("dashboard.title")}</h1>
            <p>{t("dashboard.subtitle")}</p>
          </div>
        </div>
        <section className="card empty-state tall">
          <HardDrive size={34} />
          <strong>{t("topbar.none")}</strong>
          <p>{t("scan.noDeviceHint")}</p>
          <button className="btn" onClick={() => setPage("connect")}>
            {t("nav.connect")} <ArrowRight size={15} />
          </button>
        </section>
      </div>
    );
  }

  const used = Math.max(0, device.storageTotal - device.storageFree);
  const topFolders = scan?.folders.filter((f) => f.depth === 1).sort((a, b) => b.size - a.size) ?? [];
  const maxTop = topFolders[0]?.size ?? 1;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("dashboard.title")}</h1>
          <p>{t("dashboard.subtitle")}</p>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={() => setPage("scan")}>
            {t("dashboard.scan")}
          </button>
          <button className="btn" onClick={() => setPage("rules")}>
            <ShieldCheck size={15} /> {t("dashboard.rules")}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat">
          <span className="stat-icon"><Database size={17} /></span>
          <span>{t("dashboard.indexed")}</span>
          <strong>{scan ? formatCount(scan.totalFiles) : "—"}</strong>
          <small>{scan ? formatBytes(scan.totalBytes) : t("dashboard.runScan")}</small>
        </div>
        <div className="stat">
          <span className="stat-icon"><HardDrive size={17} /></span>
          <span>{t("dashboard.storage")}</span>
          <strong>{formatBytes(used)}</strong>
          <small>{t("dashboard.usedOf", { value: percent(used, device.storageTotal).toFixed(1) })}</small>
        </div>
        <div className="stat">
          <span className="stat-icon"><Sparkles size={17} /></span>
          <span>{t("dashboard.free")}</span>
          <strong>{formatBytes(device.storageFree)}</strong>
          <small>{t("dashboard.of", { size: formatBytes(device.storageTotal) })}</small>
        </div>
        <div className="stat">
          <span className="stat-icon"><FileStack size={17} /></span>
          <span>{t("dashboard.selection")}</span>
          <strong>{dryRun ? formatBytes(dryRun.summary.candidateBytes) : "—"}</strong>
          <small>{dryRun ? t("common.filesCount", { count: formatCount(dryRun.summary.candidateFiles) }) : t("dashboard.notBuilt")}</small>
        </div>
      </div>

      <div className="grid dashboard-grid">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>{t("dashboard.ring")}</h2>
              <p>{device.model || device.serial} · Android {device.androidVersion}</p>
            </div>
          </div>
          <StorageRing used={used} total={device.storageTotal} />
          <DeviceCard device={device} compact />
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>{t("dashboard.top")}</h2>
              <p>{scan ? t("dashboard.scanned", { count: formatCount(scan.totalFiles) }) : t("dashboard.populate")}</p>
            </div>
            {scan && <button className="btn ghost small" onClick={() => setPage("scan")}>{t("dashboard.openScan")}</button>}
          </div>
          {topFolders.length === 0 ? (
            <div className="empty-state small">
              <p>{t("dashboard.empty")}</p>
              <button className="btn small" onClick={() => setPage("scan")}>{t("dashboard.start")}</button>
            </div>
          ) : (
            <>
              <Treemap folders={scan!.folders} rootPath="/storage/emulated/0" onSelect={() => setPage("scan")} />
              <div className="bar-list">
                {topFolders.slice(0, 7).map((folder) => (
                  <div key={folder.path} className="bar-row">
                    <span className="bar-name">{folder.name}</span>
                    <div className="bar-track">
                      <i style={{ width: `${Math.max(2, (folder.size / maxTop) * 100)}%` }} />
                    </div>
                    <span className="bar-value">{formatBytes(folder.size)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <section className="card flow-card">
        <div className="flow-step">
          <b>1</b>
          <div><strong>{t("dashboard.flow1")}</strong><span>{t("dashboard.flow1Text")}</span></div>
        </div>
        <ArrowRight size={18} />
        <div className="flow-step">
          <b>2</b>
          <div><strong>{t("dashboard.flow2")}</strong><span>{t("dashboard.flow2Text")}</span></div>
        </div>
        <ArrowRight size={18} />
        <div className="flow-step">
          <b>3</b>
          <div><strong>{t("dashboard.flow3")}</strong><span>{t("dashboard.flow3Text")}</span></div>
        </div>
        <ArrowRight size={18} />
        <div className="flow-step">
          <b>4</b>
          <div><strong>{t("dashboard.flow4")}</strong><span>{t("dashboard.flow4Text")}</span></div>
        </div>
      </section>
    </div>
  );
}
