import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { formatBytes, formatCount, shortPath } from "../lib/format";
import type { FolderStat } from "../types";
import { useI18n } from "../useI18n";

interface Props {
  folders: FolderStat[];
  rootPath: string;
  onSelect?: (path: string) => void;
}

function parentOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "" : path.slice(0, idx);
}

export function FolderTree({ folders, rootPath, onSelect }: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const children = useMemo(() => {
    const map = new Map<string, FolderStat[]>();
    for (const folder of folders) {
      const parent = parentOf(folder.path);
      if (!map.has(parent)) map.set(parent, []);
      map.get(parent)!.push(folder);
    }
    for (const list of map.values()) list.sort((a, b) => b.size - a.size);
    return map;
  }, [folders]);

  const roots = children.get(rootPath) ?? [];
  if (roots.length === 0) {
    return <div className="tree-empty">{t("scan.noFolders")}</div>;
  }

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderRows = (list: FolderStat[], depth: number): ReactNode[] =>
    list.slice(0, 250).flatMap((folder) => {
      const hasChildren = children.has(folder.path);
      const isOpen = expanded.has(folder.path);
      const rows: ReactNode[] = [
        <div
          key={folder.path}
          className="tree-row"
          style={{ paddingLeft: 10 + depth * 18 }}
          onClick={() => hasChildren && toggle(folder.path)}
          title={folder.path}
        >
          <span className={`tree-chevron ${isOpen ? "open" : ""}`}>
            {hasChildren ? <ChevronRight size={14} /> : <span className="tree-spacer" />}
          </span>
          {isOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
          <span className="tree-name">{shortPath(folder.name, 46)}</span>
          <span className="tree-files">{t("common.filesCount", { count: formatCount(folder.files) })}</span>
          <span className="tree-size">{formatBytes(folder.size)}</span>
          {hasChildren && onSelect && (
            <button
              className="tree-drill"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(folder.path);
              }}
            >
              {t("common.drill")}
            </button>
          )}
        </div>,
      ];
      if (isOpen) rows.push(...renderRows(children.get(folder.path) ?? [], depth + 1));
      return rows;
    });

  return <div className="folder-tree">{renderRows(roots, 0)}</div>;
}
