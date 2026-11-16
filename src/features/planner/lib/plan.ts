import type {
  Artwork,
  PlanConflict,
  PlanSkip,
  PlanSkipReason,
  PlanStop,
  Point,
  VisitPlan,
  VisitSettings,
  VisitZone,
} from "../../../shared/types";
import { GALLERY_BOUNDS, WALK_SPEED, zonesFor } from "../../../shared/zones";
import { gridPath, pathLength, pointFree, segmentFree } from "./geometry";

export const DEFAULT_BUDGET_SECONDS = 8 * 60;
export const MIN_BUDGET_SECONDS = 60;
export const MAX_BUDGET_SECONDS = 90 * 60;
export const WALK_MARGIN_SECONDS = 15;

export const defaultSettings = (): VisitSettings => ({
  budgetSeconds: DEFAULT_BUDGET_SECONDS,
  mustSee: [],
  closedZoneIds: [],
});

/** Minimum dwell is the larger of the label time and the full narration. */
export function dwellSeconds(a: Artwork): number {
  return Math.max(a.minView || 0, a.duration);
}

export type PlanInput = {
  settings: VisitSettings;
  artworks: Artwork[];
  viewingPoint: (a: Artwork) => Point;
  from: Point;
  completedIds: string[];
  manualSkips: PlanSkip[];
  previousOrder: string[] | null;
  revision: number;
  /** Works the visitor took out of the must-see set during this visit. */
  removedMustSeeIds?: string[];
};

type Leg = { path: Point[]; distance: number; seconds: number };

function planLeg(from: Point, to: Point, obstacles: VisitZone[]): Leg | null {
  // A viewing point swallowed by a closure is unreachable even though the grid
  // search would happily snap to the nearest cell outside the zone.
  if (!pointFree(to, obstacles, GALLERY_BOUNDS)) return null;
  const path = gridPath(from, to, obstacles, GALLERY_BOUNDS);
  if (!path) return null;
  const distance = pathLength(path);
  return { path, distance, seconds: distance / WALK_SPEED };
}

function straightEstimate(from: Point, to: Point, obstacles: VisitZone[]): number {
  const direct = Math.hypot(to.x - from.x, to.z - from.z);
  return segmentFree(from, to, obstacles, GALLERY_BOUNDS) ? direct : direct + 8;
}

function optimiseOrder(
  start: Point,
  ids: string[],
  artworkById: (id: string) => Artwork | undefined,
  viewingPoint: (a: Artwork) => Point,
  obstacles: VisitZone[],
): string[] {
  const remaining = [...ids].sort();
  const greed: string[] = [];
  let cursor = start;
  while (remaining.length) {
    let best = remaining[0];
    let bestCost = Infinity;
    for (const id of remaining) {
      const a = artworkById(id);
      if (!a) continue;
      const cost = straightEstimate(cursor, viewingPoint(a), obstacles);
      if (cost < bestCost - 1e-9) {
        bestCost = cost;
        best = id;
      }
    }
    greed.push(best);
    remaining.splice(remaining.indexOf(best), 1);
    const a = artworkById(best);
    if (a) cursor = viewingPoint(a);
  }
  const at = (id: string) => {
    const a = artworkById(id);
    return a ? viewingPoint(a) : start;
  };
  const cost = (seq: string[]) => {
    let total = 0;
    let cursor = start;
    for (const id of seq) {
      total += straightEstimate(cursor, at(id), obstacles);
      cursor = at(id);
    }
    return total;
  };
  let bestCost = cost(greed);
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    for (let i = 0; i < greed.length - 1; i++) {
      for (let j = i + 1; j < greed.length; j++) {
        const candidate = [...greed];
        const slice = candidate.slice(i, j + 1).reverse();
        candidate.splice(i, slice.length, ...slice);
        const c = cost(candidate);
        if (c < bestCost - 1e-9) {
          bestCost = c;
          for (let k = 0; k < greed.length; k++) greed[k] = candidate[k];
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return greed;
}

/**
 * Preserve the announced order where possible and splice in newly added or
 * unlocked works at the slot the optimiser suggested. Deterministic output, so
 * previews and per-tick re-plans do not reshuffle the queue.
 */
export function stableOrder(
  previous: string[],
  candidate: string[],
  allowed: string[],
): { order: string[]; stable: boolean } {
  const allow = new Set(allowed);
  const order = previous.filter((id) => allow.has(id));
  const kept = new Set(order);
  for (const id of candidate) {
    if (kept.has(id) || !allow.has(id)) continue;
    const idx = candidate.indexOf(id);
    let insertAt = order.length;
    for (let back = idx - 1; back >= 0; back--) {
      const anchor = candidate[back];
      if (kept.has(anchor)) {
        insertAt = order.indexOf(anchor) + 1;
        break;
      }
    }
    if (insertAt === order.length && idx > 0) {
      for (let front = idx + 1; front < candidate.length; front++) {
        const anchor = candidate[front];
        if (kept.has(anchor)) {
          insertAt = order.indexOf(anchor);
          break;
        }
      }
    }
    order.splice(insertAt, 0, id);
    kept.add(id);
  }
  const stable =
    order.length === candidate.length &&
    order.every((id, i) => candidate[i] === id);
  return { order, stable };
}

const SKIP_PRIORITY: Record<PlanSkipReason, number> = {
  manual: 6,
  removed: 5,
  closed: 4,
  unreachable: 3,
  ended: 2,
  budget: 1,
};

export function mergeSkips(base: PlanSkip[], extra: PlanSkip[]): PlanSkip[] {
  const map = new Map<string, PlanSkip>();
  for (const s of [...base, ...extra]) {
    const current = map.get(s.id);
    if (!current || SKIP_PRIORITY[s.reason] > SKIP_PRIORITY[current.reason])
      map.set(s.id, s);
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function seqCost(
  order: string[],
  from: Point,
  artworkById: (id: string) => Artwork | undefined,
  viewingPoint: (a: Artwork) => Point,
  obstacles: VisitZone[],
) {
  let cursor = from;
  let walk = 0;
  let view = 0;
  let narration = 0;
  const stops: PlanStop[] = [];
  const lost: string[] = [];
  for (const id of order) {
    const a = artworkById(id);
    if (!a) continue;
    const target = viewingPoint(a);
    const leg = planLeg(cursor, target, obstacles);
    if (!leg) {
      lost.push(id);
      continue;
    }
    stops.push({
      id,
      travelSeconds: leg.seconds,
      walkDistance: leg.distance,
      minView: a.minView || 0,
      narration: a.duration,
      path: leg.path,
    });
    walk += leg.seconds;
    view += dwellSeconds(a);
    narration += a.duration;
    cursor = target;
  }
  return { stops, lost, walk, view, narration, total: walk + view };
}

function makePlan(
  ctx: {
    revision: number;
    budget: number;
    stops: PlanStop[];
    walk: number;
    view: number;
    narration: number;
    total: number;
    conflicts: PlanConflict[];
    skips: PlanSkip[];
    orderStable: boolean;
  },
): VisitPlan {
  return {
    revision: ctx.revision,
    budgetSeconds: ctx.budget,
    stops: ctx.stops,
    totalSeconds: ctx.total,
    totalDistance: ctx.stops.reduce((n, s) => n + s.walkDistance, 0),
    walkSeconds: ctx.walk,
    viewSeconds: ctx.view,
    narrationSeconds: ctx.narration,
    conflicts: ctx.conflicts,
    skips: ctx.skips,
    feasible: ctx.conflicts.length === 0,
    orderStable: ctx.orderStable,
  };
}

export function buildPlan(input: PlanInput): VisitPlan {
  const {
    settings,
    artworks,
    viewingPoint,
    from,
    completedIds,
    manualSkips,
    previousOrder,
    revision,
  } = input;
  const removedMustSee = new Set(input.removedMustSeeIds ?? []);
  const byId = (id: string) => artworks.find((a) => a.id === id);
  const obstacles = zonesFor(settings.closedZoneIds);
  const completed = new Set(completedIds);
  const manualSkipIds = new Set(manualSkips.map((s) => s.id));
  const mustSee = [...new Set(settings.mustSee)].filter(
    (id) => byId(id) && !completed.has(id) && !manualSkipIds.has(id),
  );
  const reachable = (a: Artwork) =>
    planLeg(from, viewingPoint(a), obstacles) !== null;
  const blocking = (a: Artwork) => {
    const p = viewingPoint(a);
    return obstacles.filter(
      (z) =>
        !z.permanent &&
        settings.closedZoneIds.includes(z.id) &&
        p.x >= z.minX &&
        p.x <= z.maxX &&
        p.z >= z.minZ &&
        p.z <= z.maxZ,
    );
  };

  const extraSkips: PlanSkip[] = [];
  const conflicts: PlanConflict[] = [];
  const closedMust: Artwork[] = [];
  const unreachableMust: Artwork[] = [];
  const usableMust: string[] = [];
  for (const id of mustSee) {
    const a = byId(id)!;
    if (reachable(a)) usableMust.push(id);
    else if (blocking(a).length) closedMust.push(a);
    else unreachableMust.push(a);
  }
  for (const a of closedMust)
    extraSkips.push({
      id: a.id,
      reason: "closed",
      note: `临时封闭“${blocking(a).map((z) => z.name).join("、")}”后，该作品观看点无法到达`,
    });
  for (const a of unreachableMust)
    extraSkips.push({
      id: a.id,
      reason: "unreachable",
      note: "当前封闭条件与墙体约束下无法到达该作品的观看点",
    });

  const optionalReachable: string[] = [];
  for (const a of artworks) {
    if (
      mustSee.includes(a.id) ||
      completed.has(a.id) ||
      manualSkipIds.has(a.id)
    )
      continue;
    if (reachable(a)) optionalReachable.push(a.id);
    else
      extraSkips.push({
        id: a.id,
        reason: blocking(a).length ? "closed" : "unreachable",
        note: blocking(a).length
          ? `临时封闭“${blocking(a).map((z) => z.name).join("、")}”后无法到达`
          : "当前封闭条件与墙体约束下无法到达该作品的观看点",
      });
  }

  const allowed = [...usableMust, ...optionalReachable];
  const seed = optimiseOrder(from, allowed, byId, viewingPoint, obstacles);
  const order = previousOrder
    ? stableOrder(
        previousOrder.filter((id) => allowed.includes(id)),
        seed,
        allowed,
      ).order
    : seed;
  const mustSet = new Set(usableMust);
  const budget = Math.max(0, settings.budgetSeconds);

  // Reserve the mandatory works first, walking them in the announced order,
  // so we can prove whether the must-see set fits before spending a second on
  // optional works.
  const mandatory = seqCost(
    order.filter((id) => mustSet.has(id)),
    from,
    byId,
    viewingPoint,
    obstacles,
  );
  if (mandatory.total > budget + 1e-6) {
    conflicts.push({
      kind: "budget",
      ids: order.filter((id) => mustSet.has(id)),
      shortfallSeconds: Math.ceil(mandatory.total - budget),
      message:
        `必看作品至少需要 ${Math.ceil(mandatory.total)} 秒（步行约 ` +
        `${Math.ceil(mandatory.walk)} 秒 + 最低观看与讲解 ${Math.ceil(mandatory.view)} 秒），` +
        `剩余预算只有 ${Math.floor(budget)} 秒，还差 ${Math.ceil(
          mandatory.total - budget,
        )} 秒。请增加预算，或把其中一件作品移出必看。`,
    });
  }
  if (closedMust.length || unreachableMust.length) {
    const closedNames = closedMust.map((a) => `《${a.title}》`).join("、");
    const lostNames = unreachableMust.map((a) => `《${a.title}》`).join("、");
    conflicts.push({
      kind: "closed",
      ids: [...closedMust, ...unreachableMust].map((a) => a.id),
      shortfallSeconds: 0,
      message: closedMust.length
        ? `临时封闭区域使必看作品 ${closedNames} 的观看点无法到达。请重新开放对应区域，或调整必看集合。`
        : `必看作品 ${lostNames} 目前无法规划出可达路线，请调整必看集合。`,
    });
  }

  // A conflict never becomes a silent drop: the must-see stops stay listed and
  // infeasible, and the caller must resolve it.
  if (conflicts.length)
    return makePlan({
      revision,
      budget,
      stops: mandatory.stops,
      walk: mandatory.walk,
      view: mandatory.view,
      narration: mandatory.narration,
      total: mandatory.total,
      conflicts,
      skips: mergeSkips(manualSkips, extraSkips).filter(
        (s) => !completed.has(s.id),
      ),
      orderStable: true,
    });

  // Second pass: walk the same stable order, inserting an optional work only
  // when doing so still leaves enough time for every remaining must-see work.
  const stops: PlanStop[] = [];
  let spent = 0;
  let cursor = from;
  const pendingMust: string[] = [];
  for (const id of order) if (mustSet.has(id)) pendingMust.push(id);
  const mandatoryRest = (
    afterId: string,
    startCursor: Point,
  ): { seconds: number; ok: boolean } => {
    const rest = pendingMust.filter(
      (m) => order.indexOf(m) > order.indexOf(afterId),
    );
    let seconds = 0;
    let c = startCursor;
    for (const id of rest) {
      const a = byId(id)!;
      const target = viewingPoint(a);
      const leg = planLeg(c, target, obstacles);
      if (!leg) return { seconds: Infinity, ok: false };
      seconds += leg.seconds + dwellSeconds(a);
      c = target;
    }
    return { seconds, ok: true };
  };

  for (const id of order) {
    const a = byId(id)!;
    const target = viewingPoint(a);
    const leg = planLeg(cursor, target, obstacles);
    if (!leg) {
      if (mustSet.has(id))
        extraSkips.push({
          id,
          reason: "unreachable",
          note: "最终核验时无法规划出到达路线",
        });
      else
        extraSkips.push({
          id,
          reason: "unreachable",
          note: "最终核验时无法规划出到达路线",
        });
      continue;
    }
    const cost = leg.seconds + dwellSeconds(a);
    const mandatoryWork = mustSet.has(id);
    if (!mandatoryWork) {
      const rest = mandatoryRest(id, target);
      if (!rest.ok || spent + cost + rest.seconds > budget + 1e-6) {
        extraSkips.push({
          id,
          reason: removedMustSee.has(id) ? "removed" : "budget",
          note: removedMustSee.has(id)
            ? `参观途中被移出必看集合；按当前顺序还需约 ${Math.ceil(
                cost,
              )} 秒，剩余预算放不下`
            : rest.seconds > 0
              ? `按当前顺序还需约 ${Math.ceil(
                  cost,
                )} 秒，并为后续必看作品预留 ${Math.ceil(
                  rest.seconds,
                )} 秒后，预算放不下`
              : `按当前顺序还需约 ${Math.ceil(
                  cost,
                )} 秒，剩余预算放不下`,
        });
        continue;
      }
    }
    stops.push({
      id,
      travelSeconds: leg.seconds,
      walkDistance: leg.distance,
      minView: a.minView || 0,
      narration: a.duration,
      path: leg.path,
    });
    spent += cost;
    cursor = target;
    if (mandatoryWork) pendingMust.splice(pendingMust.indexOf(id), 1);
  }

  const walk = stops.reduce((n, st) => n + st.travelSeconds, 0);
  const view = stops.reduce((n, st) => n + dwellSeconds(byId(st.id)!), 0);
  const narration = stops.reduce((n, st) => n + st.narration, 0);
  const skips = mergeSkips(manualSkips, extraSkips).filter(
    (s) => !completed.has(s.id),
  );
  const stable =
    !previousOrder ||
    (stops.length === previousOrder.length &&
      stops.every((st, i) => previousOrder[i] === st.id));
  return makePlan({
    revision,
    budget,
    stops,
    walk,
    view,
    narration,
    total: walk + view,
    conflicts: [],
    skips,
    orderStable: stable,
  });
}

export function planSummary(plan: VisitPlan) {
  return {
    walk: Math.round(plan.walkSeconds),
    view: Math.round(plan.viewSeconds),
    total: Math.round(plan.totalSeconds),
    remaining: Math.max(0, Math.round(plan.budgetSeconds - plan.totalSeconds)),
  };
}
