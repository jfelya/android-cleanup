import { Check, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import { formatBytes, formatCount } from "../lib/format";
import type { CategorySummary } from "../types";
import { categoryTranslation, type TranslationKey } from "../i18n";
import { useI18n } from "../useI18n";

interface Props {
  category: CategorySummary;
  enabled: boolean;
  maxBytes: number;
  onToggle: () => void;
  onPreview?: () => void;
}

export function CategoryCard({ category, enabled, maxBytes, onToggle, onPreview }: Props) {
  const { language, t } = useI18n();
  const Icon =
    category.confidence === "safe" ? ShieldCheck : category.confidence === "probable" ? ShieldAlert : Lock;
  const width = maxBytes > 0 ? Math.max(2, (category.bytes / maxBytes) * 100) : 0;
  const label = categoryTranslation(language, category.id, "label", category.label);
  const confidence = t(`confidence.${category.confidence}` as TranslationKey);
  return (
    <button
      className={`category-card ${enabled ? "enabled" : ""} conf-${category.confidence}`}
      onClick={onToggle}
      onDoubleClick={onPreview}
      title={label}
    >
      <div className="category-top">
        <span className="category-icon">
          <Icon size={16} />
        </span>
        <span className="category-id">{category.id}</span>
        <span className={`check ${enabled ? "on" : ""}`}>{enabled && <Check size={12} />}</span>
      </div>
      <strong>{label}</strong>
      <span className="category-conf">{confidence}</span>
      <div className="category-stats">
        <span>{t("common.filesCount", { count: formatCount(category.files) })}</span>
        <span>{formatBytes(category.bytes)}</span>
      </div>
      <div className="category-bar">
        <i style={{ width: `${width}%` }} />
      </div>
    </button>
  );
}
