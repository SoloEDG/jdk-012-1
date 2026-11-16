import type { Point, Rect, VisitZone } from "./types";

export const WALK_SPEED = 2.5;
export const GALLERY_BOUNDS: Rect = {
  minX: -4.8,
  maxX: 4.8,
  minZ: -6.8,
  maxZ: 6.8,
};
export const WALKER_RADIUS = 0.22;

/** The plinth in the middle of the room is architecture, not a temporary closure. */
export const permanentZones: VisitZone[] = [
  {
    id: "plinth",
    name: "中央雕塑区",
    note: "展厅中庭的固定雕塑基座，任何路线都需绕行。",
    minX: -1.35,
    maxX: 1.35,
    minZ: -1.5,
    maxZ: 0.9,
    permanent: true,
  },
];

/** Areas a visitor may close off for maintenance while a visit is in progress. */
export const closureZones: VisitZone[] = [
  {
    id: "north",
    name: "北端展区",
    note: "封闭后《无声的潮汐》的观看点无法到达。",
    minX: -4.8,
    maxX: 4.8,
    minZ: -6.8,
    maxZ: -5.2,
  },
  {
    id: "south",
    name: "南端展区",
    note: "封闭后《时间的容器》的观看点无法到达。",
    minX: -4.8,
    maxX: 4.8,
    minZ: 3.2,
    maxZ: 6.8,
  },
  {
    id: "west",
    name: "西侧廊道",
    note: "封闭后《浮游之城》的观看点无法到达，穿越西侧需要绕行。",
    minX: -4.8,
    maxX: -2.6,
    minZ: -3,
    maxZ: 3,
  },
  {
    id: "east",
    name: "东侧廊道",
    note: "封闭后《夜的生长》的观看点无法到达，穿越东侧需要绕行。",
    minX: 2.6,
    maxX: 4.8,
    minZ: -3,
    maxZ: 3,
  },
  {
    id: "aisle",
    name: "北侧中庭通道",
    note: "封闭北侧中庭通道后，东西两翼之间需要绕行，步行时间会增加但并不减少可看的作品。",
    minX: -2.2,
    maxX: 2.2,
    minZ: -4.8,
    maxZ: -3.2,
  },
];

export const allZones = [...permanentZones, ...closureZones];

export function inflate(r: Rect, by: number): Rect {
  return {
    minX: r.minX - by,
    maxX: r.maxX + by,
    minZ: r.minZ - by,
    maxZ: r.maxZ + by,
  };
}

export function zonesFor(closedZoneIds: string[]): VisitZone[] {
  const closed = new Set(closedZoneIds);
  return allZones.filter((z) => z.permanent || closed.has(z.id));
}

export function zoneLabel(id: string) {
  return allZones.find((z) => z.id === id)?.name ?? id;
}

export function zoneByName(id: string) {
  return allZones.find((z) => z.id === id);
}

export function containsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
}

export function centerOf(r: Rect): Point {
  return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
}
