import { describe, expect, it } from "vitest";
import {
  confidenceLabel,
  formatBytes,
  formatCount,
  percent,
  shortPath,
} from "./format";

describe("formatBytes", () => {
  it("uses binary units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.0 KiB");
    expect(formatBytes(1024 * 1024 * 1.5)).toBe("1.5 MiB");
    expect(formatBytes(1024 ** 3 * 2)).toBe("2.0 GiB");
  });
});

describe("formatCount", () => {
  it("groups thousands", () => {
    expect(formatCount(94132)).toMatch(/94[,.\s]?132/);
  });
});

describe("percent", () => {
  it("clamps and handles zero", () => {
    expect(percent(5, 10)).toBe(50);
    expect(percent(20, 10)).toBe(100);
    expect(percent(1, 0)).toBe(0);
  });
});

describe("shortPath", () => {
  it("keeps short paths and trims long ones", () => {
    expect(shortPath("/a/b", 20)).toBe("/a/b");
    const out = shortPath("/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/a.jpg", 40);
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out).toContain("…");
  });
});

describe("confidenceLabel", () => {
  it("maps confidence to UI labels", () => {
    expect(confidenceLabel("safe")).toBe("Safe junk");
    expect(confidenceLabel("probable")).toBe("Probably junk");
    expect(confidenceLabel("ask")).toBe("Ask first");
  });
});
