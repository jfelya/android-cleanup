import {
  Cable,
  FileText,
  HardDrive,
  HeartPulse,
  History,
  LayoutDashboard,
  LockKeyhole,
  ScanSearch,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Page } from "../types";
import type { TranslationKey } from "../i18n";
import { useAppStore } from "../store";
import { useI18n } from "../useI18n";
import { LanguageThemeToggle } from "./LanguageThemeToggle";

const items: { id: Page; label: TranslationKey; icon: typeof Cable }[] = [
  { id: "connect", label: "nav.connect", icon: Cable },
  { id: "dashboard", label: "nav.dashboard", icon: LayoutDashboard },
  { id: "health", label: "nav.health", icon: HeartPulse },
  { id: "scan", label: "nav.scan", icon: ScanSearch },
  { id: "rules", label: "nav.rules", icon: ShieldCheck },
  { id: "protected", label: "nav.protected", icon: LockKeyhole },
  { id: "report", label: "nav.report", icon: FileText },
  { id: "logs", label: "nav.logs", icon: History },
  { id: "settings", label: "nav.settings", icon: Settings },
];

export function Sidebar() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const device = useAppStore((s) => s.device);
  const devices = useAppStore((s) => s.devices);
  const { t } = useI18n();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <HardDrive size={20} />
          <Sparkles size={11} className="brand-spark" />
        </div>
        <div>
          <strong>{t("app.brand")}</strong>
          <span>{t("app.subtitle")}</span>
        </div>
      </div>

      <nav className="nav">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              <Icon size={17} />
              <span>{t(item.label)}</span>
              {item.id === "report" && <em className="nav-dot" />}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <LanguageThemeToggle />
        <div className="side-status">
          <span className={`status-dot ${device ? "online" : devices.length ? "warn" : ""}`} />
          <div>
            <strong>{device ? device.model || device.serial : t("topbar.none")}</strong>
            <span>{device ? `Android ${device.androidVersion}` : t("sidebar.hint")}</span>
          </div>
        </div>
        <div className="side-version">
          <span>v0.1.0</span>
          <span>{t("app.portable")}</span>
        </div>
      </div>
    </aside>
  );
}
