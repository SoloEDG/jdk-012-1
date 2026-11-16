import type { Point, Rect } from "../../../shared/types";
import { WALKER_RADIUS, containsPoint } from "../../../shared/zones";

export const GRID_STEP = 0.2;

class MinHeap {
  private items: { k: string; f: number }[] = [];
  get size() {
    return this.items.length;
  }
  push(k: string, f: number) {
    const items = this.items;
    items.push({ k, f });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].f <= items[i].f) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }
  pop(): string | null {
    const items = this.items;
    if (!items.length) return null;
    const top = items[0];
    const last = items.pop()!;
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let min = i;
        if (l < items.length && items[l].f < items[min].f) min = l;
        if (r < items.length && items[r].f < items[min].f) min = r;
        if (min === i) break;
        [items[min], items[i]] = [items[i], items[min]];
        i = min;
      }
    }
    return top.k;
  }
}

export function inflate(r: Rect, by: number): Rect {
  return {
    minX: r.minX - by,
    maxX: r.maxX + by,
    minZ: r.minZ - by,
    maxZ: r.maxZ + by,
  };
}

export function inBounds(p: Point, bounds: Rect, margin = WALKER_RADIUS): boolean {
  return (
    p.x >= bounds.minX + margin &&
    p.x <= bounds.maxX - margin &&
    p.z >= bounds.minZ + margin &&
    p.z <= bounds.maxZ - margin
  );
}

export function isFree(p: Point, obstacles: Rect[], bounds: Rect): boolean {
  if (!inBounds(p, bounds)) return false;
  return !obstacles.some((z) => containsPoint(inflate(z, WALKER_RADIUS), p));
}

export function pointFree(p: Point, obstacles: Rect[], bounds: Rect): boolean {
  return isFree(p, obstacles, bounds);
}

type Node = { i: number; j: number; x: number; z: number };

function key(i: number, j: number) {
  return i + ":" + j;
}

/**
 * Visibility-graph path over a coarse grid. Grid nodes keep the search deterministic
 * (identical inputs always produce the identical list of waypoints), which is what
 * lets a live re-plan keep its order stable instead of jittering every tick.
 */
export function gridPath(
  from: Point,
  to: Point,
  obstacles: Rect[],
  bounds: Rect,
): Point[] | null {
  const cols = Math.round((bounds.maxX - bounds.minX) / GRID_STEP);
  const rows = Math.round((bounds.maxZ - bounds.minZ) / GRID_STEP);
  const toCell = (p: Point) => ({
    i: Math.max(0, Math.min(cols, Math.round((p.x - bounds.minX) / GRID_STEP))),
    j: Math.max(0, Math.min(rows, Math.round((p.z - bounds.minZ) / GRID_STEP))),
  });
  const toPoint = (i: number, j: number): Point => ({
    x: bounds.minX + i * GRID_STEP,
    z: bounds.minZ + j * GRID_STEP,
  });
  const start = toCell(from);
  const goal = toCell(to);

  // Snap a start/end that sits inside an inflated obstacle to the nearest free cell.
  const snap = (c: { i: number; j: number }, near: Point) => {
    if (isFree(toPoint(c.i, c.j), obstacles, bounds)) return c;
    let best: { i: number; j: number } | null = null;
    let bestD = Infinity;
    for (let di = -6; di <= 6; di++) {
      for (let dj = -6; dj <= 6; dj++) {
        const i = c.i + di;
        const j = c.j + dj;
        if (i < 0 || j < 0 || i > cols || j > rows) continue;
        const p = toPoint(i, j);
        if (!isFree(p, obstacles, bounds)) continue;
        const d =
          Math.hypot(p.x - near.x, p.z - near.z) + Math.hypot(i - c.i, j - c.j) * 0.01;
        if (d < bestD) {
          bestD = d;
          best = { i, j };
        }
      }
    }
    return best;
  };
  const s = snap(start, from);
  const g = snap(goal, to);
  if (!s || !g) return null;

  const nodes = new Map<string, Node>();
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j <= rows; j++) {
      const p = toPoint(i, j);
      if (isFree(p, obstacles, bounds)) nodes.set(key(i, j), { i, j, ...p });
    }
  }
  const startKey = key(s.i, s.j);
  const goalKey = key(g.i, g.j);
  if (!nodes.has(startKey) || !nodes.has(goalKey)) return null;

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const closed = new Set<string>();
  const heap = new MinHeap();
  dist.set(startKey, 0);
  const h = (i: number, j: number) =>
    Math.hypot(i - g.i, j - g.j) * GRID_STEP;
  heap.push(startKey, h(s.i, s.j));
  while (heap.size) {
    const bestKey = heap.pop()!;
    if (closed.has(bestKey)) continue;
    closed.add(bestKey);
    if (bestKey === goalKey) break;
    const n = nodes.get(bestKey)!;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const nk = key(n.i + di, n.j + dj);
        const m = nodes.get(nk);
        if (!m || closed.has(nk)) continue;
        if (di && dj) {
          // never cut a diagonal corner through an obstacle
          if (
            !nodes.has(key(n.i + di, n.j)) ||
            !nodes.has(key(n.i, n.j + dj))
          )
            continue;
        }
        const step = Math.hypot(di, dj) * GRID_STEP;
        const candidate = (dist.get(bestKey) || 0) + step;
        if (candidate < (dist.get(nk) ?? Infinity) - 1e-9) {
          dist.set(nk, candidate);
          prev.set(nk, bestKey);
          heap.push(nk, candidate + h(m.i, m.j));
        }
      }
    }
  }
  if (!closed.has(goalKey) && goalKey !== startKey) return null;

  const cells: Point[] = [];
  let cursor: string | undefined = goalKey;
  while (cursor) {
    const n = nodes.get(cursor)!;
    cells.push({ x: n.x, z: n.z });
    if (cursor === startKey) break;
    cursor = prev.get(cursor);
  }
  cells.reverse();
  const raw = [{ ...from }, ...cells.slice(1), { ...to }];

  // Shortcut: keep only waypoints where the straight segment stays free.
  const simplified: Point[] = [raw[0]];
  let anchor = 0;
  for (let k = 2; k < raw.length; k++) {
    if (!segmentFree(raw[anchor], raw[k], obstacles, bounds)) {
      simplified.push(raw[k - 1]);
      anchor = k - 1;
    }
  }
  simplified.push(raw[raw.length - 1]);
  const out = simplified.filter(
    (p, idx) =>
      idx === 0 ||
      Math.hypot(p.x - simplified[idx - 1].x, p.z - simplified[idx - 1].z) > 1e-6,
  );
  return out;
}

export function segmentFree(
  a: Point,
  b: Point,
  obstacles: Rect[],
  bounds: Rect,
): boolean {
  const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.08));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    if (!isFree(p, obstacles, bounds)) return false;
  }
  return true;
}

export function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].z - points[i - 1].z,
    );
  return total;
}
