import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useI18n } from "../useI18n";

interface Props {
  open: boolean;
  title: string;
  confirmLabel: string;
  requireText?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  requireText,
  busy = false,
  onCancel,
  onConfirm,
  children,
}: Props) {
  const [typed, setTyped] = useState("");
  const [ack, setAck] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    if (open) {
      setTyped("");
      setAck(false);
    }
  }, [open]);

  if (!open) return null;
  const ready = (!requireText || typed === requireText) && (requireText ? ack : true) && !busy;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-icon">
            <AlertTriangle size={18} />
          </span>
          <strong>{title}</strong>
          <button className="icon-btn" onClick={onCancel} aria-label={t("common.close")}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          {children}
          {requireText && (
            <>
              <label className="check-line">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                {t("report.understand")}
              </label>
              <label className="field">
                <span>
                  {t("report.typeDelete")} <b>{requireText}</b>
                </span>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={requireText}
                  autoFocus
                />
              </label>
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button className="btn danger" onClick={onConfirm} disabled={!ready}>
            {busy ? t("common.working") : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
