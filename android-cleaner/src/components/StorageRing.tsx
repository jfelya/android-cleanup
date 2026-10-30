import { useId } from "react";
import { formatBytes, percent } from "../lib/format";
import { useI18n } from "../useI18n";

interface Props {
  used: number;
  total: number;
}

export function StorageRing({ used, total }: Props) {
  const id = useId().replace(/:/g, "");
  const { t } = useI18n();
  const pct = percent(used, total);
  const radius = 84;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  const free = Math.max(0, total - used);

  return (
    <div className="storage-ring">
      <svg viewBox="0 0 220 220" role="img" aria-label={t("common.percentUsed", { value: pct.toFixed(1) })}>
        <defs>
          <linearGradient id={`ring-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5eead4" />
            <stop offset="55%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#f0abfc" />
          </linearGradient>
        </defs>
        <circle className="ring-track" cx="110" cy="110" r={radius} />
        <circle
          className="ring-value"
          cx="110"
          cy="110"
          r={radius}
          stroke={`url(#ring-${id})`}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-label">
        <strong>{formatBytes(free)}</strong>
        <span>{t("common.free")}</span>
        <small>{t("common.percentUsed", { value: pct.toFixed(1) })}</small>
      </div>
    </div>
  );
}
