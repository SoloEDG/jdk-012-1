import type { Point } from "../../../shared/types";
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.z - b.z);
export function constrain(p: Point): Point {
  return {
    x: Math.max(-4.8, Math.min(4.8, p.x)),
    z: Math.max(-6.8, Math.min(6.8, p.z)),
  };
}
/**
 * Move one step toward a waypoint. Waypoints come from the planner, which
 * already guarantees a collision-free polyline, so no local detour is needed.
 */
export function approach(p: Point, target: Point, dt: number): Point {
  const d = distance(p, target);
  if (d < 0.02) return target;
  const k = Math.min(d, dt * 2.5) / d;
  return constrain({
    x: p.x + (target.x - p.x) * k,
    z: p.z + (target.z - p.z) * k,
  });
}
export function viewingPoint(p: Point, facing: number): Point {
  return { x: p.x + Math.sin(facing) * 2, z: p.z + Math.cos(facing) * 2 };
}
