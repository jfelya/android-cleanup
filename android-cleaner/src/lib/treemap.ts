import { hierarchy, treemap, type HierarchyRectangularNode } from "d3-hierarchy";
import type { FolderStat } from "../types";

export interface TreemapTile {
  path: string;
  name: string;
  size: number;
  files: number;
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
}

interface Datum {
  path: string;
  name: string;
  size: number;
  files: number;
  children?: Datum[];
}

export function buildTreemap(
  folders: FolderStat[],
  rootPath: string,
  width: number,
  height: number,
): TreemapTile[] {
  const prefix = rootPath.endsWith("/") ? rootPath : `${rootPath}/`;
  const children: Datum[] = folders
    .filter((folder) => {
      if (!folder.path.startsWith(prefix)) return false;
      const rest = folder.path.slice(prefix.length);
      return rest.length > 0 && !rest.includes("/");
    })
    .map((folder) => ({
      path: folder.path,
      name: folder.name,
      size: Math.max(1, folder.size),
      files: folder.files,
    }))
    .sort((a, b) => b.size - a.size);

  if (children.length === 0) return [];

  const root = hierarchy<Datum>({
    path: rootPath,
    name: "root",
    size: 0,
    files: 0,
    children,
  }).sum((d) => d.size);
  treemap<Datum>()
    .size([Math.max(1, width), Math.max(1, height)])
    .paddingInner(2)
    .paddingOuter(0)
    .round(true)(root);

  return (root.leaves() as HierarchyRectangularNode<Datum>[]).map((leaf, index) => ({
    path: leaf.data.path,
    name: leaf.data.name,
    size: leaf.data.size,
    files: leaf.data.files,
    x: leaf.x0,
    y: leaf.y0,
    width: Math.max(0, leaf.x1 - leaf.x0),
    height: Math.max(0, leaf.y1 - leaf.y0),
    index,
  }));
}
