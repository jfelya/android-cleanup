import { HardDrive, Smartphone, Usb } from "lucide-react";
import { formatBytes, percent } from "../lib/format";
import type { DeviceInfo } from "../types";
import { useI18n } from "../useI18n";

interface Props {
  device: DeviceInfo;
  compact?: boolean;
}

export function DeviceCard({ device, compact = false }: Props) {
  const { t } = useI18n();
  const used = Math.max(0, device.storageTotal - device.storageFree);
  const pct = percent(used, device.storageTotal);
  return (
    <div className={`device-card ${compact ? "compact" : ""}`}>
      <div className="device-head">
        <div className="device-icon">
          <Smartphone size={22} />
        </div>
        <div className="device-title">
          <strong>{device.model || device.serial}</strong>
          <span>
            <Usb size={12} /> {device.serial}
          </span>
        </div>
        <span className="pill online">{t("common.connected")}</span>
      </div>
      <div className="device-meta">
        <span>Android {device.androidVersion}</span>
        <span>SDK {device.sdk}</span>
        <span>{device.product || device.device}</span>
      </div>
      <div className="storage-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="storage-caption">
        <span>
          <HardDrive size={13} /> {formatBytes(used)} {t("common.used")}
        </span>
        <span>{formatBytes(device.storageFree)} {t("common.free")}</span>
        <span>{formatBytes(device.storageTotal)} {t("common.total")}</span>
      </div>
    </div>
  );
}
