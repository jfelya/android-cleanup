import { useEffect, useState } from "react";
import { HardDrive, RefreshCw, ScanSearch, X } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ConnectPage } from "./pages/ConnectPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HealthPage } from "./pages/HealthPage";
import { ScanPage } from "./pages/ScanPage";
import { RulesPage } from "./pages/RulesPage";
import { ProtectedPage } from "./pages/ProtectedPage";
import { ReportPage } from "./pages/ReportPage";
import { LogsPage } from "./pages/LogsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { api, onCleanupProgress, onScanProgress } from "./lib/tauri";
import { useAppStore } from "./store";
import { useI18n } from "./useI18n";
import { LanguageThemeToggle } from "./components/LanguageThemeToggle";
import { translateError, type TranslationKey } from "./i18n";
import type { Page } from "./types";

const pageMeta: Record<Page, [TranslationKey, TranslationKey]> = {
  connect: ["page.connect", "page.connectSub"],
  dashboard: ["page.dashboard", "page.dashboardSub"],
  health: ["page.health", "page.healthSub"],
  scan: ["page.scan", "page.scanSub"],
  rules: ["page.rules", "page.rulesSub"],
  protected: ["page.protected", "page.protectedSub"],
  report: ["page.report", "page.reportSub"],
  logs: ["page.logs", "page.logsSub"],
  settings: ["page.settings", "page.settingsSub"],
};

function App() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const devices = useAppStore((s) => s.devices);
  const setDevices = useAppStore((s) => s.setDevices);
  const selectedSerial = useAppStore((s) => s.selectedSerial);
  const selectDevice = useAppStore((s) => s.selectDevice);
  const device = useAppStore((s) => s.device);
  const setDevice = useAppStore((s) => s.setDevice);
  const setConfig = useAppStore((s) => s.setConfig);
  const scan = useAppStore((s) => s.scan);
  const setScan = useAppStore((s) => s.setScan);
  const setDryRun = useAppStore((s) => s.setDryRun);
  const setScanProgress = useAppStore((s) => s.setScanProgress);
  const setCleanupProgress = useAppStore((s) => s.setCleanupProgress);
  const error = useAppStore((s) => s.error);
  const setError = useAppStore((s) => s.setError);
  const theme = useAppStore((s) => s.theme);
  const language = useAppStore((s) => s.language);
  const { t } = useI18n();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = language;
  }, [theme, language]);

  useEffect(() => {
    api.loadConfig().then(setConfig).catch((e) => setError(String(e)));
  }, [setConfig, setError]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const list = await api.listDevices();
        if (!alive) return;
        setDevices(list);
        if (!selectedSerial) {
          const first = list.find((d) => d.state === "device");
          if (first) selectDevice(first.serial);
        }
      } catch {
        /* adb can be briefly busy; the next poll retries */
      }
    };
    void tick();
    const handle = window.setInterval(tick, 3000);
    return () => {
      alive = false;
      window.clearInterval(handle);
    };
  }, [selectedSerial, setDevices, selectDevice]);

  useEffect(() => {
    if (!selectedSerial) {
      setDevice(null);
      return;
    }
    let alive = true;
    api
      .deviceInfo(selectedSerial)
      .then((info) => alive && setDevice(info))
      .catch(() => alive && setDevice(null));
    return () => {
      alive = false;
    };
  }, [selectedSerial, setDevice]);

  useEffect(() => {
    if (!selectedSerial) {
      setScan(null);
      setDryRun(null);
      return;
    }
    if (scan && scan.serial !== selectedSerial) {
      setScan(null);
      setDryRun(null);
    }
  }, [selectedSerial, scan?.serial, setScan, setDryRun]);

  useEffect(() => {
    if (!selectedSerial) return;
    const online = devices.some(
      (d) => d.serial === selectedSerial && d.state === "device",
    );
    if (!online) {
      setDevice(null);
      setScan(null);
      setDryRun(null);
    }
  }, [devices, selectedSerial, setDevice, setScan, setDryRun]);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    Promise.all([
      onScanProgress((count) => setScanProgress(count)),
      onCleanupProgress((message) => setCleanupProgress(message)),
    ]).then((fns) => unlisteners.push(...fns));
    return () => unlisteners.forEach((fn) => fn());
  }, [setScanProgress, setCleanupProgress]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      setDevices(await api.listDevices());
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const [titleKey, subtitleKey] = pageMeta[page];
  const connected = device !== null;
  const unauthorized = devices.some((d) => d.state === "unauthorized");

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h2>{t(titleKey)}</h2>
            <span>{t(subtitleKey)}</span>
          </div>
          <div className="topbar-actions">
            <div className="mobile-toggles"><LanguageThemeToggle /></div>
            <div className={`conn-pill ${connected ? "online" : unauthorized ? "warn" : ""}`}>
              <span className={`status-dot ${connected ? "online" : unauthorized ? "warn" : ""}`} />
              {connected ? t("topbar.ready") : unauthorized ? t("topbar.auth") : t("topbar.none")}
            </div>
            <button className="icon-btn" onClick={refresh} disabled={refreshing} title={t("topbar.refresh")} aria-label={t("topbar.refresh")}>
              <RefreshCw size={16} className={refreshing ? "spin" : ""} />
            </button>
            {connected && (
              <button className="btn small" onClick={() => setPage("scan")}>
                <ScanSearch size={14} /> {t("topbar.scan")}
              </button>
            )}
          </div>
        </header>

        <div className="content">
          {page === "connect" && <ConnectPage />}
          {page === "dashboard" && <DashboardPage />}
          {page === "health" && <HealthPage />}
          {page === "scan" && <ScanPage />}
          {page === "rules" && <RulesPage />}
          {page === "protected" && <ProtectedPage />}
          {page === "report" && <ReportPage />}
          {page === "logs" && <LogsPage />}
          {page === "settings" && <SettingsPage />}
        </div>
      </main>

      {error && (
        <div className="toast">
          <HardDrive size={16} />
          <span>{translateError(language, error)}</span>
          <button className="icon-btn" onClick={() => setError(null)} aria-label={t("common.close")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
