import { describe, expect, it } from "vitest";
import type { FolderStat } from "../types";
import { buildTreemap } from "./treemap";

const folder = (path: string, size: number, depth: number): FolderStat => ({
  path,
  name: path.split("/").pop() ?? path,
  depth,
  size,
  files: 1,
});

describe("buildTreemap", () => {
  it("lays out direct children proportionally", () => {
    const folders = [
      folder("/storage/emulated/0/DCIM", 300, 1),
      folder("/storage/emulated/0/Download", 100, 1),
      folder("/storage/emulated/0/DCIM/Camera", 300, 2),
    ];
    const tiles = buildTreemap(folders, "/storage/emulated/0", 400, 200);
    expect(tiles).toHaveLength(2);
    const dcim = tiles.find((t) => t.name === "DCIM")!;
    const download = tiles.find((t) => t.name === "Download")!;
    expect(dcim.width * dcim.height).toBeGreaterThan(download.width * download.height);
    for (const tile of tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.x + tile.width).toBeLessThanOrEqual(400);
      expect(tile.y + tile.height).toBeLessThanOrEqual(200);
    }
  });

  it("returns empty for a leaf folder", () => {
    const tiles = buildTreemap(
      [folder("/storage/emulated/0/DCIM/Camera", 10, 2)],
      "/storage/emulated/0/DCIM/Camera",
      100,
      100,
    );
    expect(tiles).toEqual([]);
  });
});
