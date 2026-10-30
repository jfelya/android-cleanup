import { useEffect, useState } from "react";
import { ChevronRight, FolderSearch, HardDrive, RefreshCw, ScanSearch } from "lucide-react";
import { api } from "../lib/tauri";
import { useAppStore } from "../store";
import { useI18n } from "../useI18n";
import { Treemap } from "../components/Treemap";
import { FolderTree } from "../components/FolderTree";
import { formatBytes, formatCount, formatDateTime } from "../lib/format";

export function ScanPage() {
  const device = useAppStore((s) => s.device);
  const scan = useAppStore((s) => s.scan);
  const setScan = useAppStore((s) => s.setScan);
  const scanning = useAppStore((s) => s.scanning);
  const setScanning = useAppStore((s) => s.setScanning);
  const scanProgress = useAppStore((s) => s.scanProgress);
  const setScanProgress = useAppStore((s) => s.setScanProgress);
  const setError = useAppStore((s) => s.setError);
  const { t } = useI18n();
  const [rootPath, setRootPath] = useState("/storage/emulated/0");

  useEffect(() => {
    if (scan) setRootPath("/storage/emulated/0");
  }, [scan]);

  const startScan = async () => {
    if (!device) return;
    setScanning(true);
    setScanProgress(0);
    setError(null);
    try {
      const result = await api.scanDevice(device.serial);
      setScan(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setScanning(false);
    }
  };

  if (!device) {
    return (
      <div className="page">
        <div className="page-head"><div><h1>{t("scan.title")}</h1><p>{t("scan.noDeviceHint")}</p></div></div>
        <section className="card empty-state tall"><FolderSearch size={32} /><strong>{t("scan.noDevice")}</strong></section>
      </div>
    );
  }

  const crumbs = rootPath.replace("/storage/emulated/0", "").split("/").filter(Boolean);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("scan.title")}</h1>
          <p>{t("scan.subtitle")}</p>
        </div>
        <button className="btn" onClick={startScan} disabled={scanning}>
          {scanning ? <RefreshCw size={15} className="spin" /> : <ScanSearch size={15} />}
          {scanning ? t("scan.scanning") : scan ? t("scan.rescan") : t("scan.start")}
        </button>
      </div>

      {scanning && (
        <div className="scan-progress card">
          <div>
            <strong>{t("scan.indexing")}</strong>
            <span>{t("scan.parsed", { count: formatCount(scanProgress) })}</span>
          </div>
          <div className="indeterminate"><i /></div>
        </div>
      )}

      {!scan ? (
        <section className="card empty-state tall">
          <HardDrive size={34} />
          <strong>{t("scan.none")}</strong>
          <p>{t("scan.noneHint")}</p>
          <button className="btn" onClick={startScan} disabled={scanning}>{t("scan.start")}</button>
        </section>
      ) : (
        <>
          <div className="stats-grid four">
            <div className="stat"><span>{t("scan.files")}</span><strong>{formatCount(scan.totalFiles)}</strong><small>{t("scan.indexed")}</small></div>
            <div className="stat"><span>{t("scan.size")}</span><strong>{formatBytes(scan.totalBytes)}</strong><small>{t("scan.apparent")}</small></div>
            <div className="stat"><span>{t("scan.folders")}</span><strong>{formatCount(scan.folders.length)}</strong><small>{t("scan.withFiles")}</small></div>
            <div className="stat"><span>{t("scan.scanned")}</span><strong>{formatDateTime(scan.scannedAt)}</strong><small>{scan.serial}</small></div>
          </div>

          <section className="card">
            <div className="card-head">
              <div>
                <h2>{t("scan.heatmap")}</h2>
                <p>{t("scan.heatmapHint")}</p>
              </div>
              <div className="crumbs">
                <button className="crumb" onClick={() => setRootPath("/storage/emulated/0")}>/sdcard</button>
                {crumbs.map((crumb, index) => {
                  const path = `/storage/emulated/0/${crumbs.slice(0, index + 1).join("/")}`;
                  return (
                    <span key={path}>
                      <ChevronRight size={12} />
                      <button className="crumb" onClick={() => setRootPath(path)}>{crumb}</button>
                    </span>
                  );
                })}
              </div>
            </div>
            <Treemap folders={scan.folders} rootPath={rootPath} onSelect={setRootPath} />
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2>{t("scan.tree")}</h2>
                <p>{rootPath}</p>
              </div>
            </div>
            <FolderTree folders={scan.folders} rootPath={rootPath} onSelect={setRootPath} />
          </section>
        </>
      )}
    </div>
  );
}
