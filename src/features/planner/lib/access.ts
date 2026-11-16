import type { Artwork, Point, VisitZone } from "../../../shared/types";
import { GALLERY_BOUNDS } from "../../../shared/zones";
import { gridPath, pointFree } from "./geometry";
export function pathTo(
  from: Point,
  target: Point,
  obstacles: VisitZone[],
): Point[] | null {
  if (!pointFree(target, obstacles, GALLERY_BOUNDS)) return null;
  return gridPath(from, target, obstacles, GALLERY_BOUNDS);
}
export function pathToArtwork(
  from: Point,
  artwork: Artwork,
  view: (a: Artwork) => Point,
  obstacles: VisitZone[],
): Point[] | null {
  return pathTo(from, view(artwork), obstacles);
}
