import { useState } from "react";
import {
  Cable,
  CheckCircle2,
  RefreshCw,
  Smartphone,
  Usb,
  Wifi,
  XCircle,
} from "lucide-react";
import { api } from "../lib/tauri";
import { useAppStore } from "../store";
import { useI18n } from "../useI18n";
import { DeviceCard } from "../components/DeviceCard";
import type { WirelessService } from "../types";

export function ConnectPage() {
  const devices = useAppStore((s) => s.devices);
  const setDevices = useAppStore((s) => s.setDevices);
  const selectedSerial = useAppStore((s) => s.selectedSerial);
  const selectDevice = useAppStore((s) => s.selectDevice);
  const device = useAppStore((s) => s.device);
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [services, setServices] = useState<WirelessService[]>([]);
  const [pairHost, setPairHost] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [connectHost, setConnectHost] = useState("");

  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      setDevices(await api.listDevices());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const discover = async () => {
    setBusy(true);
    setError("");
    try {
      setServices(await api.mdnsServices());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const pair = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.pairWireless(pairHost, pairCode);
      setMessage(result ? t("connect.paired") : t("connect.paired"));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const connect = async (host: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.connectWireless(host);
      setMessage(result || t("connect.connectedTo", { host }));
      const list = await api.listDevices();
      setDevices(list);
      const target = list.find((d) => d.state === "device");
      if (target) selectDevice(target.serial);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("connect.title")}</h1>
          <p>{t("connect.subtitle")}</p>
        </div>
        <button className="btn ghost" onClick={refresh} disabled={busy}>
          <RefreshCw size={15} /> {t("common.refresh")}
        </button>
      </div>

      {(message || error) && (
        <div className={`notice ${error ? "bad" : "good"}`}>
          {error ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{error || message}</span>
        </div>
      )}

      <div className="grid two">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>
                <Usb size={16} /> {t("connect.usb")}
              </h2>
              <p>{t("connect.usbHint")}</p>
            </div>
            <span className="count-badge">{devices.length}</span>
          </div>

          {devices.length === 0 ? (
            <div className="empty-state">
              <Cable size={30} />
              <strong>{t("connect.none")}</strong>
              <p>{t("connect.noneHint")}</p>
            </div>
          ) : (
            <div className="device-list">
              {devices.map((row) => (
                <button
                  key={row.serial}
                  className={`device-row ${selectedSerial === row.serial ? "selected" : ""}`}
                  onClick={() => selectDevice(row.serial)}
                >
                  <Smartphone size={18} />
                  <div>
                    <strong>{row.model || row.serial}</strong>
                    <span>{row.serial}</span>
                  </div>
                  <span className={`pill ${row.state === "device" ? "online" : "warn"}`}>{row.state}</span>
                </button>
              ))}
            </div>
          )}

          {device && (
            <div className="spaced">
              <DeviceCard device={device} />
            </div>
          )}

          {devices.some((d) => d.state === "unauthorized") && (
            <div className="troubleshoot">
              <strong>{t("connect.unauthorized")}</strong>
              <ol>
                <li>{t("connect.step1")}</li>
                <li>{t("connect.step2")}</li>
                <li>{t("connect.step3")}</li>
              </ol>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>
                <Wifi size={16} /> {t("connect.wireless")}
              </h2>
              <p>{t("connect.wirelessHint")}</p>
            </div>
            <button className="btn ghost small" onClick={discover} disabled={busy}>
              {t("connect.discover")}
            </button>
          </div>

          <div className="wireless-list">
            {services.length === 0 && <p className="muted">{t("connect.noMdns")}</p>}
            {services.map((service) => (
              <div key={service.name} className="wireless-row">
                <div>
                  <strong>{service.serviceType === "pairing" ? t("connect.pairing") : t("connect.connection")}</strong>
                  <span>{service.address}</span>
                </div>
                {service.serviceType === "pairing" ? (
                  <button className="btn ghost small" onClick={() => setPairHost(service.address)}>
                    {t("connect.use")}
                  </button>
                ) : (
                  <button className="btn small" onClick={() => connect(service.address)} disabled={busy}>
                    {t("connect.connection")}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="wireless-form">
            <h3>{t("connect.pairCode")}</h3>
            <div className="inline-fields">
              <input
                placeholder="192.168.1.20:37123"
                value={pairHost}
                onChange={(e) => setPairHost(e.target.value)}
              />
              <input
                placeholder={t("connect.codePlaceholder")}
                value={pairCode}
                onChange={(e) => setPairCode(e.target.value)}
              />
              <button className="btn" onClick={pair} disabled={busy || !pairHost || !pairCode}>
                {t("connect.pair")}
              </button>
            </div>
            <h3>{t("connect.connectAddress")}</h3>
            <div className="inline-fields">
              <input
                placeholder="192.168.1.20:5555"
                value={connectHost}
                onChange={(e) => setConnectHost(e.target.value)}
              />
              <button className="btn" onClick={() => connect(connectHost)} disabled={busy || !connectHost}>
                {t("connect.connection")}
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>{t("connect.checklist")}</h2>
            <p>{t("connect.checklistHint")}</p>
          </div>
        </div>
        <div className="check-grid">
          <div>
            <strong>1. {t("connect.cable")}</strong>
            <span>{t("connect.cableText")}</span>
          </div>
          <div>
            <strong>2. {t("connect.mode")}</strong>
            <span>{t("connect.modeText")}</span>
          </div>
          <div>
            <strong>3. {t("connect.auth")}</strong>
            <span>{t("connect.authText")}</span>
          </div>
          <div>
            <strong>4. {t("connect.driver")}</strong>
            <span>{t("connect.driverText")}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
