import type {
  Artwork,
  PlanSkip,
  PlanStop,
  Point,
  VisitPlan,
  VisitSettings,
  VisitZone,
} from "../../../shared/types";
import { GALLERY_BOUNDS, WALK_SPEED, zonesFor } from "../../../shared/zones";
import { gridPath, pathLength, pointFree } from "./geometry";
import { dwellSeconds } from "./plan";

/** Rebuild a specific order with fresh paths, even if it exceeds the budget. */
export function buildForcedPlan(args: {
  ids: string[];
  settings: VisitSettings;
  artworks: Artwork[];
  viewingPoint: (a: Artwork) => Point;
  from: Point;
  elapsed: number;
  revision: number;
  skips?: PlanSkip[];
}): VisitPlan {
  const { ids, settings, artworks, viewingPoint, from, elapsed, revision } = args;
  const skips = args.skips ?? [];
  const byId = (id: string) => artworks.find((a) => a.id === id);
  const obstacles: VisitZone[] = zonesFor(settings.closedZoneIds);
  const stops: PlanStop[] = [];
  const lost: string[] = [];
  let cursor = from;
  let walk = 0;
  let view = 0;
  let narration = 0;
  for (const id of ids) {
    const a = byId(id);
    if (!a) continue;
    const target = viewingPoint(a);
    const path = pointFree(target, obstacles, GALLERY_BOUNDS)
      ? gridPath(cursor, target, obstacles, GALLERY_BOUNDS)
      : null;
    if (!path) {
      lost.push(id);
      continue;
    }
    const distance = pathLength(path);
    stops.push({
      id,
      travelSeconds: distance / WALK_SPEED,
      walkDistance: distance,
      minView: a.minView || 0,
      narration: a.duration,
      path,
    });
    walk += distance / WALK_SPEED;
    view += dwellSeconds(a);
    narration += a.duration;
    cursor = target;
  }
  const total = walk + view;
  return {
    revision,
    budgetSeconds: Math.max(0, settings.budgetSeconds - elapsed),
    stops,
    totalSeconds: total,
    totalDistance: stops.reduce((n, s) => n + s.walkDistance, 0),
    walkSeconds: walk,
    viewSeconds: view,
    narrationSeconds: narration,
    conflicts: lost.length
      ? [
          {
            kind: "closed",
            ids: lost,
            shortfallSeconds: 0,
            message:
              "恢复的计划中有作品在当前区域条件下不可达：" +
              lost.map((id) => byId(id)?.title).join("、") +
              "。",
          },
        ]
      : [],
    skips,
    feasible: lost.length === 0,
    orderStable: true,
  };
}
