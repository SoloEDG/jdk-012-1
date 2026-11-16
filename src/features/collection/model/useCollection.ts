import { useState, useEffect } from "react";
import { loadDocument, saveDocument } from "../../../shared/storage";
import { artworkById } from "../../../shared/catalog";
import type { PlanSkipReason, VisitPlan } from "../../../shared/types";
export function useCollection() {
  const [document, setDocument] = useState(loadDocument);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    setStorageError(!saveDocument(document));
  }, [document]);
  return {
    document,
    storageError,
    toggle: (id: string) =>
      setDocument((d) => ({
        ...d,
        favorites: d.favorites.includes(id)
          ? d.favorites.filter((x) => x !== id)
          : [...d.favorites, id],
      })),
    recordSkip: (id: string, reason: PlanSkipReason, note: string) => {
      if (!artworkById(id)) return;
      setDocument((d) => ({
        ...d,
        skips: [
          ...d.skips.filter((s) => s.id !== id),
          { id, reason, note, at: Date.now() },
        ],
      }));
    },
    clearSkips: () =>
      setDocument((d) =>
        d.skips.length || d.plan ? { ...d, skips: [], plan: null } : d,
      ),
    recordPlan: (plan: VisitPlan) =>
      setDocument((d) => {
        // The skip list mirrors the current plan exactly: a work that becomes
        // schedulable again must not keep a stale "skipped" explanation.
        const previous = new Map(d.skips.map((s) => [s.id, s] as const));
        const skips = plan.skips.map((s) => ({
          id: s.id,
          reason: s.reason,
          note: s.note,
          at: previous.get(s.id)?.at ?? Date.now(),
        }));
        return {
          ...d,
          skips,
          plan: {
            at: Date.now(),
            budgetSeconds: plan.budgetSeconds,
            totalSeconds: plan.totalSeconds,
            walkSeconds: plan.walkSeconds,
            viewSeconds: plan.viewSeconds,
            stops: plan.stops.map((s) => ({
              id: s.id,
              travelSeconds: s.travelSeconds,
              minView: s.minView,
              narration: s.narration,
            })),
          },
        };
      }),
    note: (id: string, text: string) =>
      setDocument((d) => ({ ...d, notes: { ...d.notes, [id]: text } })),
    record: (id: string, seconds: number) => {
      if (!artworkById(id)) return;
      setDocument((d) => {
        const previous = d.visits.find((v) => v.id === id);
        return {
          ...d,
          visits: previous
            ? d.visits.map((v) =>
                v.id === id ? { ...v, seconds: v.seconds + seconds } : v,
              )
            : [...d.visits, { id, seconds, at: Date.now() }],
        };
      });
    },
  };
}
