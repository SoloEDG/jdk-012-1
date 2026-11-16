import type { Point, VisitPlan } from "../../../shared/types";
import { artworks } from "../../../shared/catalog";
import { closureZones, viewingPoint } from "../lib/mapGeometry";
export function Map({
  position,
  active,
  onSelect,
  large = false,
  plan = null,
  closedZoneIds = [],
  mustSee = [],
}: {
  position: Point;
  active: string | null;
  onSelect: (id: string) => void;
  large?: boolean;
  plan?: VisitPlan | null;
  closedZoneIds?: string[];
  mustSee?: string[];
}) {
  const sx = (x: number) => 80 + x * 10;
  const sy = (z: number) => 90 + z * 10;
  const stops = plan?.stops || [];
  const route =
    stops.length > 1
      ? stops
          .map((s, i) =>
            s.path
              .map(
                (p: Point, j: number) =>
                  `${i === 0 && j === 0 ? "M" : "L"}${sx(p.x)},${sy(p.z)}`,
              )
              .join(" "),
          )
          .join(" ")
      : "";
  return (
    <svg
      className={large ? "map large" : "map"}
      viewBox="0 0 160 190"
      aria-label="展馆平面导航"
    >
      <rect x="12" y="10" width="136" height="165" rx="2" fill="#e6e2d7" />
      <path d="M12 65H148M12 120H148M57 10V175M103 10V175" stroke="#d4d0c5" />
      <rect x="67" y="88" width="26" height="20" fill="#b8ad94" />
      {closureZones
        .filter((z) => closedZoneIds.includes(z.id))
        .map((z) => (
          <rect
            key={z.id}
            x={sx(z.minX)}
            y={sy(z.minZ)}
            width={(z.maxX - z.minX) * 10}
            height={(z.maxZ - z.minZ) * 10}
            fill="#a25a4a66"
            stroke="#8d4738"
            strokeDasharray="3 2"
          >
            <title>{z.name + " · 临时封闭"}</title>
          </rect>
        ))}
      {route && (
        <path
          data-testid="plan-route"
          d={route}
          fill="none"
          stroke="#7c6a3f"
          strokeWidth="2.2"
          strokeDasharray="4 3"
          strokeLinejoin="round"
          opacity="0.85"
        />
      )}
      {artworks.map((a, i) => {
        const vp = viewingPoint(a.position, a.facing);
        const must = mustSee.includes(a.id);
        const inPlan = stops.some((s) => s.id === a.id);
        return (
          <g
            key={a.id}
            onClick={() => onSelect(a.id)}
            role="button"
            tabIndex={0}
            aria-label={"前往" + a.title}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSelect(a.id);
            }}
          >
            <circle
              cx={sx(a.position.x)}
              cy={sy(a.position.z)}
              r={active === a.id ? 9 : 7}
              fill={
                active === a.id
                  ? "#c5a66d"
                  : must
                    ? "#5f7a4f"
                    : inPlan
                      ? "#8d8a63"
                      : "#797c72"
              }
              stroke={must ? "#d8c48f" : "none"}
              strokeWidth={must ? 1.6 : 1}
            >
              <title>
                {a.title}
                {must ? " · 必看" : ""}
              </title>
            </circle>
            <text
              x={sx(a.position.x)}
              y={sy(a.position.z) + 3}
              textAnchor="middle"
              fill="white"
              fontSize="8"
            >
              {i + 1}
            </text>
            <circle
              cx={sx(vp.x)}
              cy={sy(vp.z)}
              r="2"
              fill="none"
              stroke="#6d6448"
              strokeWidth="1"
            />
          </g>
        );
      })}
      <circle
        data-testid="map-position"
        cx={sx(position.x)}
        cy={sy(position.z)}
        r="5"
        fill="#282c26"
        stroke="white"
        strokeWidth="2"
      />
      <text x="80" y="187" textAnchor="middle" fontSize="9" fill="#77796d">
        南入口 · SOUTH ENTRANCE
      </text>
    </svg>
  );
}
