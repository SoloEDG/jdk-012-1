import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  PlanSkipReason,
  Point,
  VisitPlan,
  VisitSettings,
  VisitZone,
} from "../../../shared/types";
import { artworks, artworkById } from "../../../shared/catalog";
import { zonesFor } from "../../../shared/zones";
import { viewingPoint } from "../../space";
import {
  applyEvent,
  createSession,
  type Event,
  type SessionAction,
  type SessionResult,
  type SessionState,
} from "../lib/session";
import { ARRIVE_RADIUS } from "../lib/session";

export type WalkerPort = {
  position: Point;
  positionRef: { current: Point };
  goPath: (path: Point[]) => void;
  stop: () => void;
  setObstacles: (zones: VisitZone[]) => void;
};

export type NarrationPort = {
  state: { artworkId: string | null; elapsed: number; playing: boolean };
  play: (id: string) => void;
  pause: () => void;
};

export type VisitPorts = {
  walker: WalkerPort;
  narration: NarrationPort;
  recordVisit: (id: string, seconds: number) => void;
  recordSkip: (id: string, reason: PlanSkipReason, note: string) => void;
  recordPlan: (plan: VisitPlan) => void;
  clearSkips: () => void;
  focus: (id: string) => void;
};

const viewOf = (a: { position: Point; facing: number }) =>
  viewingPoint(a.position, a.facing);

export function useVisit(ports: VisitPorts) {
  const portsRef = useRef(ports);
  portsRef.current = ports;
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const stateRef = useRef<SessionState | null>(null);

  if (!stateRef.current) {
    stateRef.current = createSession({
      artworks,
      view: viewOf,
      from: ports.walker.positionRef.current,
      now: Date.now(),
    });
  }

  const state = stateRef.current;

  const recordedPlan = useRef<string>("");

  /** Explain every unplanned work as soon as the plan says so — not only at the end. */
  const syncPlan = useCallback((plan: VisitPlan) => {
    const p = portsRef.current;
    const signature = [
      plan.budgetSeconds,
      plan.stops.map((s) => s.id + ":" + Math.round(s.travelSeconds)).join(","),
      plan.skips.map((s) => s.id + ":" + s.reason).join(","),
    ].join("|");
    if (recordedPlan.current !== signature) {
      recordedPlan.current = signature;
      p.recordPlan(plan);
    }
  }, []);

  const runActions = useCallback((actions: SessionAction[]) => {
    const p = portsRef.current;
    for (const action of actions) {
      switch (action.type) {
        case "walk":
          p.walker.goPath(action.path);
          break;
        case "halt":
          p.walker.stop();
          break;
        case "narrate":
          p.narration.play(action.id);
          break;
        case "hush":
          p.narration.pause();
          break;
        case "focus":
          p.focus(action.id);
          break;
        case "visited":
          p.recordVisit(action.id, action.seconds);
          break;
        case "skipped":
          p.recordSkip(action.id, action.reason, action.note);
          break;
        case "zones":
          p.walker.setObstacles(zonesFor(action.ids));
          break;
        case "clearSkips":
          recordedPlan.current = "";
          p.clearSkips();
          break;
        case "plan":
          p.recordPlan(action.plan);
          break;
      }
    }
  }, []);

  const dispatch = useCallback(
    (event: Event) => {
      const current = stateRef.current!;
      const next: SessionResult = applyEvent(current, event, {
        artworks,
        view: viewOf,
        from: portsRef.current.walker.positionRef.current,
        now: Date.now(),
      });
      stateRef.current = next.state;
      runActions(next.actions);
      syncPlan(next.state.plan);
      bump();
    },
    [runActions],
  );

  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    syncPlan(stateRef.current!.plan);
  }, [syncPlan]);

  // One clock drives walking time, listening time and periodic re-planning.
  useEffect(() => {
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 1.5);
      last = now;
      const s = stateRef.current!;
      if (
        s.phase !== "walking" &&
        s.phase !== "listening" &&
        s.phase !== "dwelling"
      )
        return;
      let atDestination = false;
      if (s.phase === "walking" && s.currentId) {
        const art = artworkById(s.currentId);
        if (art) {
          const p = portsRef.current.walker.positionRef.current;
          const target = viewOf(art);
          atDestination =
            Math.hypot(p.x - target.x, p.z - target.z) <= ARRIVE_RADIUS;
        }
      }
      dispatchRef.current({
        type: "tick",
        dt,
        atDestination,
        narrating: portsRef.current.narration.state.playing,
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  // Keep the walker's roaming collision model aligned with temporary closures.
  useEffect(() => {
    portsRef.current.walker.setObstacles(
      zonesFor(state.settings.closedZoneIds),
    );
  }, [state.settings.closedZoneIds]);

  const onNarrationEnd = useCallback(() => {
    const s = stateRef.current!;
    if (s.phase !== "listening") return;
    dispatchRef.current({ type: "narrationEnd" });
  }, []);

  return {
    state,
    plan: state.plan,
    conflict: state.conflict,
    lastExecutable: state.lastExecutable,
    currentId: state.currentId,
    completed: state.completed,
    finishedIds: state.completed.filter((c) => !c.skipped).map((c) => c.id),
    notice: state.notice,
    pending: state.pending,
    phase: state.phase,
    spent: state.spent,
    settings: state.settings,
    budgetSeconds: state.settings.budgetSeconds,
    remainingSeconds: Math.max(0, state.settings.budgetSeconds - state.spent),
    hasStarted: state.phase !== "idle" && state.phase !== "done",
    onNarrationEnd,
    start: () => dispatchRef.current({ type: "start" }),
    setBudget: (seconds: number) =>
      dispatchRef.current({ type: "budget", seconds }),
    toggleMustSee: (id: string) =>
      dispatchRef.current({ type: "mustSee", id }),
    toggleZone: (id: string) => dispatchRef.current({ type: "zone", id }),
    pause: () => dispatchRef.current({ type: "pause" }),
    resume: () => dispatchRef.current({ type: "resume" }),
    manual: () => dispatchRef.current({ type: "manual" }),
    next: () => dispatchRef.current({ type: "next" }),
    skip: () => dispatchRef.current({ type: "skip" }),
    restore: () => dispatchRef.current({ type: "restore" }),
    end: () => dispatchRef.current({ type: "end" }),
    journey: (mustSee: string[], budgetSeconds: number) =>
      dispatchRef.current({ type: "journey", mustSee, budgetSeconds }),
    reset: () => {
      recordedPlan.current = "";
      dispatchRef.current({ type: "reset", keepSettings: true });
    },
    dismissNotice: () => {
      stateRef.current!.notice = null;
      bump();
    },
  };
}

export type VisitApi = ReturnType<typeof useVisit>;
export type { VisitSettings };
