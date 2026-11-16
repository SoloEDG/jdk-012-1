import { useEffect, useRef } from "react";
import { useWalker, distance, viewingPoint } from "../features/space";
import { useCatalog } from "../features/catalog";
import { useNarration } from "../features/narration";
import { useVisit } from "../features/planner";
import { useCollection } from "../features/collection";
import { artworkById } from "../shared/catalog";
export function useGallery() {
  const catalog = useCatalog();
  const collection = useCollection();
  const manualRef = useRef<() => void>(() => {});
  const walker = useWalker(catalog.observe, () => manualRef.current());
  const visitRef = useRef<ReturnType<typeof useVisit> | null>(null);
  const narration = useNarration(() => visitRef.current?.onNarrationEnd());
  const visit = useVisit({
    walker,
    narration,
    recordVisit: collection.record,
    recordSkip: collection.recordSkip,
    recordPlan: collection.recordPlan,
    clearSkips: collection.clearSkips,
    focus: catalog.select,
  });
  visitRef.current = visit;
  manualRef.current = visit.manual;
  const go = (id: string) => {
    const a = artworkById(id);
    if (!a) return;
    // Browsing away mid-visit pauses the announced plan instead of silently
    // abandoning a stop; the recap therefore never loses a completed record.
    if (
      (visit.phase === "walking" ||
        visit.phase === "listening" ||
        visit.phase === "dwelling") &&
      visit.currentId !== id
    )
      visit.pause();
    catalog.select(id);
    walker.go(viewingPoint(a.position, a.facing));
    walker.yaw.current = a.facing;
  };
  const current = useRef({
    nearby: catalog.nearby,
    record: collection.record,
    active: false,
  });
  current.current = {
    nearby: catalog.nearby,
    record: collection.record,
    active:
      visit.phase === "walking" ||
      visit.phase === "listening" ||
      visit.phase === "dwelling",
  };
  // Free exploration accumulates time here; during a planned visit the session
  // records the exact dwell per stop, so the two never double-count.
  useEffect(() => {
    const t = setInterval(() => {
      if (current.current.active) return;
      if (current.current.nearby)
        current.current.record(current.current.nearby, 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);
  return {
    catalog,
    visit,
    collection,
    walker,
    narration,
    go,
    stopTour: () => {
      visit.end();
      walker.stop();
      narration.pause();
    },
  };
}
export { distance };
