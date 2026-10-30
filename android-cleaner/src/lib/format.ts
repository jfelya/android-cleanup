import type { Confidence } from "../types";

const UNITS = ["B", "KiB", "MiB", "GiB", "TiB"];

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : decimals;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined).format(value);
}

export function formatDate(epochSeconds: number): string {
  if (!epochSeconds) return "—";
  return new Date(epochSeconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (part / total) * 100));
}

export function confidenceLabel(confidence: Confidence): string {
  switch (confidence) {
    case "safe":
      return "Safe junk";
    case "probable":
      return "Probably junk";
    case "ask":
      return "Ask first";
  }
}

export function shortPath(path: string, max = 72): string {
  if (path.length <= max) return path;
  const head = path.slice(0, Math.floor(max / 2) - 2);
  const tail = path.slice(-Math.floor(max / 2));
  return `${head}…${tail}`;
}

export function estimateGain(bytes: number): string {
  return bytes > 0 ? `+${formatBytes(bytes)}` : "—";
}
