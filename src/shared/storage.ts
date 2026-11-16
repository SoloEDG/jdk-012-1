import type { GalleryDocument } from "./types";
const key = "yujing-gallery-v1";
export const emptyDocument = (): GalleryDocument => ({
  favorites: [],
  visits: [],
  notes: {},
  skips: [],
  plan: null,
});
export function loadDocument(): GalleryDocument {
  try {
    const d = JSON.parse(localStorage.getItem(key) || "null");
    if (!d) return emptyDocument();
    return {
      favorites: Array.isArray(d.favorites)
        ? d.favorites.filter((v: unknown) => typeof v === "string")
        : [],
      visits: Array.isArray(d.visits)
        ? d.visits.filter(
            (v: { id?: unknown; seconds?: unknown }) =>
              typeof v.id === "string" && typeof v.seconds === "number",
          )
        : [],
      notes: typeof d.notes === "object" && d.notes ? d.notes : {},
      skips: Array.isArray(d.skips)
        ? d.skips.filter(
            (s: { id?: unknown; reason?: unknown }) =>
              typeof s.id === "string" && typeof s.reason === "string",
          )
        : [],
      plan:
        d.plan &&
        Array.isArray(d.plan.stops) &&
        typeof d.plan.budgetSeconds === "number"
          ? d.plan
          : null,
    };
  } catch {
    return emptyDocument();
  }
}
export function saveDocument(d: GalleryDocument): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}
