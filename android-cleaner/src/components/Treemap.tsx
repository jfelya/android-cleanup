import { useMemo } from "react";
import { buildTreemap } from "../lib/treemap";
import { formatBytes, shortPath } from "../lib/format";
import type { FolderStat } from "../types";
import { useI18n } from "../useI18n";

const COLORS = [
  "#5eead4",
  "#67e8f9",
  "#818cf8",
  "#a78bfa",
  "#f0abfc",
  "#f9a8d4",
  "#fbbf24",
  "#86efac",
  "#93c5fd",
  "#fca5a5",
];

interface Props {
  folders: FolderStat[];
  rootPath: string;
  onSelect?: (path: string) => void;
}

export function Treemap({ folders, rootPath, onSelect }: Props) {
  const { t } = useI18n();
  const width = 800;
  const height = 320;
  const tiles = useMemo(
    () => buildTreemap(folders, rootPath, width, height),
    [folders, rootPath],
  );

  if (tiles.length === 0) {
    return <div className="treemap-empty">{t("scan.noSubtrees")}</div>;
  }

  return (
    <div className="treemap-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="treemap" role="img">
        {tiles.map((tile) => {
          const color = COLORS[tile.index % COLORS.length];
          const canDrill = folders.some((f) => f.path.startsWith(`${tile.path}/`));
          const area = tile.width * tile.height;
          return (
            <g
              key={tile.path}
              className={canDrill && onSelect ? "treemap-tile drillable" : "treemap-tile"}
              onClick={() => canDrill && onSelect?.(tile.path)}
            >
              <title>{`${tile.path}\n${formatBytes(tile.size)} · ${t("common.filesCount", { count: tile.files })}`}</title>
              <rect
                x={tile.x}
                y={tile.y}
                width={tile.width}
                height={tile.height}
                rx={5}
                fill={color}
                fillOpacity={0.16}
                stroke={color}
                strokeOpacity={0.55}
              />
              {area > 12000 && (
                <>
                  <text x={tile.x + 10} y={tile.y + 22} className="tile-name">
                    {tile.name.length > 24 ? `${tile.name.slice(0, 22)}…` : tile.name}
                  </text>
                  <text x={tile.x + 10} y={tile.y + 40} className="tile-size">
                    {formatBytes(tile.size)}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <div className="treemap-legend">
        {tiles.slice(0, 5).map((tile) => (
          <span key={tile.path}>
            <i style={{ background: COLORS[tile.index % COLORS.length] }} />
            {shortPath(tile.name, 26)}
          </span>
        ))}
      </div>
    </div>
  );
}
