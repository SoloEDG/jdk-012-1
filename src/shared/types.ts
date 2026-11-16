export type Point = { x: number; z: number };
export type Artwork = {
  id: string;
  title: string;
  en: string;
  artist: string;
  year: string;
  medium: string;
  color: string;
  position: Point;
  facing: number;
  description: string;
  transcript: string[];
  duration: number;
  minView: number;
};
export type Route = {
  id: string;
  name: string;
  subtitle: string;
  stops: string[];
};
export type Visit = { id: string; seconds: number; at: number };
export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
export type VisitZone = Rect & {
  id: string;
  name: string;
  note: string;
  permanent?: boolean;
};
export type PlanSkipReason =
  | "budget"
  | "closed"
  | "removed"
  | "manual"
  | "ended"
  | "unreachable";
export type SkipRecord = {
  id: string;
  reason: PlanSkipReason;
  note: string;
  at: number;
};
export type PlannedStopRecord = {
  id: string;
  travelSeconds: number;
  minView: number;
  narration: number;
};
export type PlanRecord = {
  at: number;
  budgetSeconds: number;
  totalSeconds: number;
  walkSeconds: number;
  viewSeconds: number;
  stops: PlannedStopRecord[];
};
export type GalleryDocument = {
  favorites: string[];
  visits: Visit[];
  notes: Record<string, string>;
  skips: SkipRecord[];
  plan: PlanRecord | null;
};
export type AudioState = {
  artworkId: string | null;
  elapsed: number;
  playing: boolean;
  rate: number;
};
export type PlanStop = {
  id: string;
  travelSeconds: number;
  walkDistance: number;
  minView: number;
  narration: number;
  path: Point[];
};
export type PlanConflict = {
  kind: "budget" | "closed";
  ids: string[];
  message: string;
  shortfallSeconds: number;
};
export type PlanSkip = {
  id: string;
  reason: PlanSkipReason;
  note: string;
};
export type VisitPlan = {
  revision: number;
  budgetSeconds: number;
  stops: PlanStop[];
  totalSeconds: number;
  totalDistance: number;
  walkSeconds: number;
  viewSeconds: number;
  narrationSeconds: number;
  conflicts: PlanConflict[];
  skips: PlanSkip[];
  feasible: boolean;
  orderStable: boolean;
};
export type VisitSettings = {
  budgetSeconds: number;
  mustSee: string[];
  closedZoneIds: string[];
};
export type PlanPhase =
  | "idle"
  | "walking"
  | "listening"
  | "dwelling"
  | "paused"
  | "blocked"
  | "done";
export type VisitNotice = {
  tone: "info" | "warning" | "error";
  title: string;
  message: string;
};
export type CompletedStop = {
  id: string;
  at: number;
  listenedSeconds: number;
  dwellSeconds: number;
  narrationCompleted: boolean;
  skipped: boolean;
};
export type Command =
  { type: "focus"; id: string } | { type: "favorite"; id: string };
