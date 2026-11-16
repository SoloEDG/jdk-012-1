import type {
  Artwork,
  CompletedStop,
  PlanPhase,
  PlanSkip,
  PlanSkipReason,
  Point,
  VisitNotice,
  VisitPlan,
  VisitSettings,
} from "../../../shared/types";
import { artworkById } from "../../../shared/catalog";
import { zonesFor } from "../../../shared/zones";
import {
  buildPlan,
  defaultSettings,
  MAX_BUDGET_SECONDS,
  MIN_BUDGET_SECONDS,
  mergeSkips,
} from "./plan";
import { buildForcedPlan } from "./forcedPlan";
import { pathTo } from "./access";

export const REPLAN_INTERVAL_MS = 1500;
export const ARRIVE_RADIUS = 0.3;
export const DWELL_TOLERANCE = 0.5;
const BUDGET_GRACE = 0.5;

export type SessionContext = {
  artworks: Artwork[];
  view: (a: Artwork) => Point;
  from: Point;
  now: number;
};

export type SessionAction =
  | { type: "walk"; path: Point[]; artworkId: string }
  | { type: "halt" }
  | { type: "narrate"; id: string }
  | { type: "hush" }
  | { type: "focus"; id: string }
  | {
      type: "visited";
      id: string;
      seconds: number;
      dwellSeconds: number;
      narrationCompleted: boolean;
      skipped: boolean;
    }
  | { type: "skipped"; id: string; reason: PlanSkipReason; note: string }
  | { type: "zones"; ids: string[] }
  | { type: "clearSkips" }
  | { type: "plan"; plan: VisitPlan };

export type SessionState = {
  settings: VisitSettings;
  phase: PlanPhase;
  spent: number;
  plan: VisitPlan;
  conflict: VisitPlan | null;
  lastExecutable: VisitPlan | null;
  currentId: string | null;
  dwellStart: number;
  dwellPausedAt: number;
  listenedThisStop: number;
  completed: CompletedStop[];
  manualSkips: PlanSkip[];
  removedMustSee: string[];
  notice: VisitNotice | null;
  pending: VisitNotice | null;
  resumePhase: PlanPhase;
  lastReplanAt: number;
  signature: string;
  overshootReported: boolean;
};

export type SessionResult = { state: SessionState; actions: SessionAction[] };

const rt = (n: number) => Math.round(n * 10) / 10;

function signatureOf(plan: VisitPlan) {
  return [
    plan.stops.map((s) => s.id).join(">"),
    plan.skips.map((s) => s.id + ":" + s.reason).join(","),
    plan.conflicts.map((c) => c.kind + ":" + c.ids.join(",")).join(","),
  ].join("|");
}

function remainingOf(s: SessionState) {
  return Math.max(0, s.settings.budgetSeconds - s.spent);
}

function completedSet(s: SessionState) {
  return new Set(s.completed.map((c) => c.id));
}

/**
 * Works the visitor actually finished. A skipped work stays in the history with
 * `skipped: true`, but must not be passed as "completed" to the planner — that
 * would suppress the explicit skip explanation.
 */
function finishedIds(s: SessionState) {
  return s.completed.filter((c) => !c.skipped).map((c) => c.id);
}

function pendingOrder(s: SessionState) {
  const done = completedSet(s);
  return s.plan.stops.map((st) => st.id).filter((id) => !done.has(id));
}

export function planFor(
  s: SessionState,
  ctx: SessionContext,
  overrides?: { settings?: VisitSettings; previousOrder?: string[] | null },
): VisitPlan {
  const settings = overrides?.settings ?? s.settings;
  return buildPlan({
    settings: { ...settings, budgetSeconds: remainingOf(s) },
    artworks: ctx.artworks,
    viewingPoint: ctx.view,
    from: ctx.from,
    completedIds: finishedIds(s),
    manualSkips: s.manualSkips,
    previousOrder:
      overrides?.previousOrder === undefined
        ? pendingOrder(s)
        : overrides.previousOrder,
    revision: s.plan.revision + 1,
    removedMustSeeIds: s.removedMustSee,
  });
}

export function createSession(ctx: SessionContext): SessionState {
  const settings = defaultSettings();
  const plan = buildPlan({
    settings,
    artworks: ctx.artworks,
    viewingPoint: ctx.view,
    from: ctx.from,
    completedIds: [],
    manualSkips: [],
    previousOrder: null,
    revision: 0,
  });
  return {
    settings,
    phase: "idle",
    spent: 0,
    plan,
    conflict: plan.feasible ? null : plan,
    lastExecutable: plan.feasible ? plan : null,
    currentId: null,
    dwellStart: 0,
    dwellPausedAt: 0,
    listenedThisStop: 0,
    completed: [],
    manualSkips: [],
    removedMustSee: [],
    notice: null,
    pending: null,
    resumePhase: "walking",
    lastReplanAt: 0,
    signature: signatureOf(plan),
    overshootReported: false,
  };
}

function clone(s: SessionState): SessionState {
  return { ...s };
}

function goTo(s: SessionState, id: string, ctx: SessionContext, actions: SessionAction[]) {
  const art = ctx.artworks.find((a) => a.id === id);
  if (!art) {
    actions.push({ type: "halt" });
    return;
  }
  s.currentId = id;
  s.listenedThisStop = 0;
  s.dwellStart = 0;
  s.dwellPausedAt = 0;
  const path = pathTo(ctx.from, ctx.view(art), zonesFor(s.settings.closedZoneIds));
  if (path) actions.push({ type: "walk", path, artworkId: id });
  else actions.push({ type: "halt" });
  actions.push({ type: "focus", id });
}

function recordSkips(s: SessionState, actions: SessionAction[]) {
  for (const skip of s.plan.skips)
    actions.push({ type: "skipped", id: skip.id, reason: skip.reason, note: skip.note });
  actions.push({ type: "plan", plan: s.plan });
}

function close(
  s: SessionState,
  notice: VisitNotice,
  actions: SessionAction[],
): SessionResult {
  const done = completedSet(s);
  const alreadySkipped = new Set(s.plan.skips.map((k) => k.id));
  const ended: PlanSkip[] = [];
  for (const stop of s.plan.stops) {
    if (done.has(stop.id) || alreadySkipped.has(stop.id)) continue;
    ended.push({
      id: stop.id,
      reason: "ended",
      note: "导览在此结束，计划内作品未参观",
    });
    actions.push({
      type: "skipped",
      id: stop.id,
      reason: "ended",
      note: "导览在此结束，计划内作品未参观",
    });
  }
  // The plan is what gets persisted, so the early-end explanations must live in
  // it — otherwise the recap would show fewer skips than actually happened.
  if (ended.length) s.plan = { ...s.plan, skips: mergeSkips(s.plan.skips, ended) };
  s.phase = "done";
  s.currentId = null;
  s.notice = notice;
  s.pending = null;
  actions.push({ type: "halt" }, { type: "hush" });
  recordSkips(s, actions);
  return { state: s, actions };
}

/** Move on after the current stop has been recorded, honouring queued re-plans. */
function advance(
  s: SessionState,
  ctx: SessionContext,
  actions: SessionAction[],
): SessionResult {
  const done = completedSet(s);
  // A settings change made while this work was playing, or a conflict that was
  // raised but deferred, is applied exactly now — after the narration finished.
  const queued = s.pending;
  const hadConflict = !!s.conflict;
  s.pending = null;
  if (queued || hadConflict) {
    const fresh = planFor(s, ctx);
    if (fresh.conflicts.length) {
      s.conflict = fresh;
      s.phase = "blocked";
      s.notice = {
        tone: "error",
        title: "重新规划失败，已保留可执行计划",
        message:
          (queued ? queued.title + "：" : "") +
          fresh.conflicts[0].message +
          " 已完成记录不会被撤销；可返回上一版可执行计划，或调整条件后继续。",
      };
      actions.push({ type: "plan", plan: fresh });
      actions.push({ type: "halt" }, { type: "hush" });
      return { state: s, actions };
    }
    s.plan = fresh;
    s.signature = signatureOf(fresh);
    s.notice = {
      tone: "info",
      title: queued ? queued.title : "讲解结束，已按新条件重排",
      message:
        `讲解结束后才切换路线；剩余 ${Math.floor(remainingOf(s) / 60)} 分 ` +
        `${Math.round(remainingOf(s) % 60)} 秒，已完成 ${s.completed.length} 站均已保留。`,
    };
    actions.push({ type: "plan", plan: fresh });
  }
  s.conflict = s.phase === "blocked" ? s.conflict : null;
  s.currentId = null;
  s.dwellStart = 0;
  s.dwellPausedAt = 0;
  const next = s.plan.stops.find((st) => !done.has(st.id));
  if (!next) {
    return close(
      s,
      {
        tone: "info",
        title: "参观完成",
        message:
          `完成 ${s.completed.length} 站` +
          (s.plan.skips.length
            ? `；${s.plan.skips.length} 件作品被跳过，原因已写入收藏回顾。`
            : "。"),
      },
      actions,
    );
  }
  s.phase = "walking";
  goTo(s, next.id, ctx, actions);
  return { state: s, actions };
}

function finishStop(
  s: SessionState,
  ctx: SessionContext,
  actions: SessionAction[],
  narrationCompleted: boolean,
): SessionResult {
  const id = s.currentId;
  if (!id) return { state: s, actions };
  const art = ctx.artworks.find((a) => a.id === id) ?? artworkById(id);
  const listened = s.listenedThisStop;
  const dwell = s.dwellStart ? (ctx.now - s.dwellStart) / 1000 : 0;
  s.completed = [
    ...s.completed.filter((c) => c.id !== id),
    {
      id,
      at: ctx.now,
      listenedSeconds: rt(listened),
      dwellSeconds: rt(dwell),
      narrationCompleted,
      skipped: false,
    },
  ];
  actions.push({
    type: "visited",
    id,
    seconds: Math.round(Math.max(dwell, listened)),
    dwellSeconds: rt(dwell),
    narrationCompleted,
    skipped: false,
  });
  if (art && dwell < art.minView - DWELL_TOLERANCE) {
    // Should not happen (dwell gate), but never silently undercount.
    s.currentId = null;
  }
  s.currentId = null;
  s.dwellStart = 0;
  return advance(s, ctx, actions);
}

export function registerCompleted(
  s: SessionState,
  id: string,
  seconds: number,
  dwellSeconds: number,
): SessionState {
  const next = clone(s);
  next.completed = [
    ...next.completed.filter((c) => c.id !== id),
    {
      id,
      at: Date.now(),
      listenedSeconds: rt(seconds),
      dwellSeconds: rt(dwellSeconds),
      narrationCompleted: false,
      skipped: true,
    },
  ];
  return next;
}

export type Event =
  | { type: "start" }
  | { type: "tick"; dt: number; atDestination: boolean; narrating: boolean }
  | { type: "narrationEnd" }
  | { type: "budget"; seconds: number }
  | { type: "mustSee"; id: string }
  | { type: "zone"; id: string }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "manual" }
  | { type: "next" }
  | { type: "skip" }
  | { type: "restore" }
  | { type: "end" }
  | { type: "journey"; mustSee: string[]; budgetSeconds: number }
  | { type: "reset"; keepSettings?: boolean };

/** Change settings while idle: refresh the preview and explain what changed. */
function settingsChanged(
  s: SessionState,
  ctx: SessionContext,
  actions: SessionAction[],
  title: string,
): SessionResult {
  if (s.phase === "idle") {
    const plan = planFor(s, ctx, { previousOrder: null });
    s.plan = plan;
    s.conflict = plan.feasible ? null : plan;
    s.signature = signatureOf(plan);
    s.notice = {
      tone: plan.feasible ? "info" : "error",
      title: plan.feasible ? title : `${title} · 条件冲突`,
      message: plan.feasible
        ? `当前条件可安排 ${plan.stops.length} 站，预计 ${Math.ceil(
            plan.totalSeconds,
          )} 秒，预算 ${Math.floor(s.settings.budgetSeconds)} 秒。`
        : plan.conflicts[0].message,
    };
    actions.push({ type: "plan", plan });
    return { state: s, actions };
  }
  if (s.phase === "done") return { state: s, actions };
  if (s.phase === "listening" || s.phase === "dwelling") {
    const art = s.currentId ? artworkById(s.currentId) : null;
    const left = art ? Math.max(0, art.duration - s.listenedThisStop) : 0;
    s.pending = {
      tone: "info",
      title: "当前讲解结束后再调整路线",
      message:
        `${title}。正在播放的讲解还剩约 ${Math.ceil(left)} 秒，播完后才切换路线；` +
        "已完成记录与当前作品不受影响。",
    };
    return { state: s, actions };
  }
  const fresh = planFor(s, ctx);
  if (fresh.conflicts.length) {
    s.conflict = fresh;
    s.phase = "blocked";
    s.notice = {
      tone: "error",
      title: `${title} · 无法继续`,
      message:
        fresh.conflicts[0].message +
        (s.lastExecutable ? " 可返回上一版可执行计划。" : ""),
    };
    s.pending = null;
    actions.push({ type: "halt" }, { type: "hush" });
    return { state: s, actions };
  }
  s.plan = fresh;
  s.lastExecutable = fresh;
  s.conflict = null;
  s.signature = signatureOf(fresh);
  const done = completedSet(s);
  const target = fresh.stops.find((st) => !done.has(st.id));
  const droppedCurrent =
    !!s.currentId && !fresh.stops.some((st) => st.id === s.currentId);
  s.notice = {
    tone: "info",
    title,
    message:
      `顺序保持稳定，仅调整剩余路线；剩余预算 ${Math.floor(
        remainingOf(s) / 60,
      )} 分 ${Math.round(remainingOf(s) % 60)} 秒。` +
      (droppedCurrent && target
        ? ` 当前作品不再列入计划，改为前往《${artworkById(target.id)?.title}》。`
        : ""),
  };
  if (s.phase === "walking" && target) {
    s.phase = "walking";
    goTo(s, target.id, ctx, actions);
  } else if (s.phase === "paused" && target && target.id !== s.currentId) {
    s.currentId = target.id;
    actions.push({ type: "halt" }, { type: "focus", id: target.id });
  }
  actions.push({ type: "plan", plan: fresh });
  return { state: s, actions };
}

export function applyEvent(
  prev: SessionState,
  event: Event,
  ctx: SessionContext,
): SessionResult {
  const s = clone(prev);
  const actions: SessionAction[] = [];
  switch (event.type) {
    case "start": {
      actions.push({ type: "clearSkips" });
      s.spent = 0;
      s.completed = [];
      s.manualSkips = [];
      s.removedMustSee = [];
      s.pending = null;
      s.overshootReported = false;
      s.dwellStart = 0;
      s.listenedThisStop = 0;
      const plan = planFor(s, ctx, { previousOrder: null });
      s.plan = plan;
      s.signature = signatureOf(plan);
      if (plan.conflicts.length || !plan.stops.length) {
        s.conflict = plan.conflicts.length ? plan : null;
        s.notice = {
          tone: plan.conflicts.length ? "error" : "warning",
          title: plan.conflicts.length ? "当前条件无法成行" : "没有可安排的作品",
          message: plan.conflicts.length
            ? plan.conflicts[0].message
            : "请放宽预算，或把作品加入必看集合。",
        };
        return { state: s, actions };
      }
      s.phase = "walking";
      s.conflict = null;
      s.lastExecutable = plan;
      s.notice = {
        tone: "info",
        title: "导览开始",
        message:
          `${plan.stops.length} 站 · 步行约 ${Math.ceil(plan.walkSeconds)} 秒 · ` +
          `最低观看与讲解约 ${Math.ceil(plan.viewSeconds)} 秒；` +
          `预算 ${Math.floor(s.settings.budgetSeconds)} 秒。`,
      };
      goTo(s, plan.stops[0].id, ctx, actions);
      actions.push({ type: "plan", plan });
      return { state: s, actions };
    }
    case "tick": {
      if (s.phase === "walking") {
        s.spent += event.dt;
        if (event.atDestination && s.currentId) {
          const art = artworkById(s.currentId);
          if (art) {
            s.phase = "listening";
            s.dwellStart = ctx.now;
            s.listenedThisStop = 0;
            s.notice = null;
            actions.push({ type: "narrate", id: art.id }, { type: "focus", id: art.id });
            return { state: s, actions };
          }
        }
        if (ctx.now - s.lastReplanAt >= REPLAN_INTERVAL_MS) {
          s.lastReplanAt = ctx.now;
          const fresh = planFor(s, ctx);
          if (fresh.conflicts.length) {
            // Keep walking if the stop we are heading to is still attainable;
            // the conflict stays visible and is resolved before the next leg.
            const stillReachable =
              !!s.currentId &&
              !fresh.conflicts.some((c) => c.ids.includes(s.currentId!)) &&
              s.plan.stops.some((st) => st.id === s.currentId);
            s.conflict = fresh;
            actions.push({ type: "plan", plan: fresh });
            if (stillReachable) {
              s.notice = {
                tone: "error",
                title: "必看作品与当前条件冲突",
                message:
                  fresh.conflicts[0].message +
                  " 当前这一站仍可完成，结束后才会暂停导览。",
              };
              return { state: s, actions };
            }
            s.phase = "blocked";
            s.notice = {
              tone: "error",
              title: "前方路线不可达",
              message:
                fresh.conflicts[0].message +
                (s.lastExecutable ? " 可返回上一版可执行计划。" : ""),
            };
            actions.push({ type: "halt" }, { type: "hush" });
            return { state: s, actions };
          }
          const done = completedSet(s);
          const target = fresh.stops.find((st) => !done.has(st.id));
          const changed = signatureOf(fresh) !== s.signature;
          s.plan = fresh;
          s.lastExecutable = fresh;
          s.conflict = null;
          s.signature = signatureOf(fresh);
          if (!target) {
            return close(
              s,
              {
                tone: "warning",
                title: "剩余预算内已无作品",
                message: "继续前进会超出预算，导览在此结束。",
              },
              actions,
            );
          }
          if (target.id !== s.currentId) {
            goTo(s, target.id, ctx, actions);
            actions.push({ type: "plan", plan: fresh });
            if (changed)
              s.notice = {
                tone: "info",
                title: "已更新路线",
                message: "剩余顺序保持不变，仅重新计算了路径与预算。",
              };
          } else {
            // Re-issue the polyline even when the stop is unchanged: a closure
            // that appeared mid-leg must divert the walk immediately, while the
            // announced order stays exactly the same.
            goTo(s, target.id, ctx, actions);
            if (changed) {
              actions.push({ type: "plan", plan: fresh });
              s.notice = {
                tone: "info",
                title: "已更新路线",
                message: "剩余顺序保持不变，仅重新计算了路径与预算。",
              };
            }
          }
        }
        return { state: s, actions };
      }
      if (s.phase === "listening") {
        if (!event.narrating) return { state: s, actions };
        s.spent += event.dt;
        s.listenedThisStop += event.dt;
        if (
          !s.overshootReported &&
          s.spent > s.settings.budgetSeconds + BUDGET_GRACE
        ) {
          s.overshootReported = true;
          s.notice = {
            tone: "warning",
            title: "预算已超出",
            message:
              "当前讲解会完整播完，之后导览结束；已完成记录不会丢失，可提高预算后继续。",
          };
        }
        return { state: s, actions };
      }
      if (s.phase === "dwelling") {
        s.spent += event.dt;
        const art = s.currentId ? artworkById(s.currentId) : null;
        if (art && s.dwellStart) {
          if ((ctx.now - s.dwellStart) / 1000 >= art.minView - DWELL_TOLERANCE)
            return finishStop(s, ctx, actions, true);
        }
        if (
          !s.overshootReported &&
          s.spent > s.settings.budgetSeconds + BUDGET_GRACE
        )
          s.overshootReported = true;
        return { state: s, actions };
      }
      return { state: s, actions };
    }
    case "narrationEnd": {
      if (s.phase !== "listening" || !s.currentId) return { state: s, actions };
      const art = artworkById(s.currentId);
      if (!art) return { state: s, actions };
      const dwell = s.dwellStart ? (ctx.now - s.dwellStart) / 1000 : 0;
      if (dwell + DWELL_TOLERANCE < art.minView) {
        s.phase = "dwelling";
        s.notice = {
          tone: "info",
          title: "讲解已结束，请再看一会儿",
          message: `本作品的最低观看时间为 ${art.minView} 秒，还差约 ${Math.ceil(
            art.minView - dwell,
          )} 秒；满足后自动前往下一站。`,
        };
        return { state: s, actions };
      }
      return finishStop(s, ctx, actions, true);
    }
    case "budget": {
      const seconds = Math.round(
        Math.max(MIN_BUDGET_SECONDS, Math.min(MAX_BUDGET_SECONDS, event.seconds)),
      );
      s.settings = { ...s.settings, budgetSeconds: seconds };
      return settingsChanged(
        s,
        ctx,
        actions,
        `预算调整为 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`,
      );
    }
    case "mustSee": {
      const was = s.settings.mustSee.includes(event.id);
      s.settings = {
        ...s.settings,
        mustSee: was
          ? s.settings.mustSee.filter((x) => x !== event.id)
          : [...s.settings.mustSee, event.id],
      };
      s.removedMustSee = was
        ? [...new Set([...s.removedMustSee, event.id])]
        : s.removedMustSee.filter((x) => x !== event.id);
      return settingsChanged(
        s,
        ctx,
        actions,
        was ? "已移出必看集合" : "已加入必看集合",
      );
    }
    case "zone": {
      const closed = s.settings.closedZoneIds.includes(event.id);
      s.settings = {
        ...s.settings,
        closedZoneIds: closed
          ? s.settings.closedZoneIds.filter((x) => x !== event.id)
          : [...s.settings.closedZoneIds, event.id],
      };
      return settingsChanged(
        s,
        ctx,
        actions,
        closed ? "已重新开放一处区域" : "已临时封闭一处区域",
      );
    }
    case "pause": {
      if (
        s.phase !== "walking" &&
        s.phase !== "listening" &&
        s.phase !== "dwelling"
      )
        return { state: s, actions };
      s.resumePhase = s.phase;
      s.phase = "paused";
      // Freeze the dwell clock so a pause does not count toward min-view time.
      if (s.dwellStart && !s.dwellPausedAt) s.dwellPausedAt = ctx.now;
      actions.push({ type: "halt" }, { type: "hush" });
      return { state: s, actions };
    }
    case "manual": {
      if (s.phase !== "walking") return { state: s, actions };
      s.resumePhase = "walking";
      s.phase = "paused";
      s.notice = {
        tone: "info",
        title: "已切换为自由行走",
        message:
          "导览已暂停，预算仍停留在当前已用时间；点击“继续”后会重新规划到当前目标。",
      };
      actions.push({ type: "halt" });
      return { state: s, actions };
    }
    case "resume": {
      if (s.phase !== "paused") return { state: s, actions };
      s.overshootReported = false;
      if (s.dwellPausedAt && s.dwellStart) {
        s.dwellStart += ctx.now - s.dwellPausedAt;
        s.dwellPausedAt = 0;
      }
      if (s.resumePhase === "listening" && s.currentId) {
        s.phase = "listening";
        actions.push({ type: "narrate", id: s.currentId });
      } else if (s.resumePhase === "dwelling" && s.currentId) {
        s.phase = "dwelling";
        if (!s.dwellStart) s.dwellStart = ctx.now;
      } else {
        const done = completedSet(s);
        const target = s.plan.stops.find((st) => !done.has(st.id));
        if (!target) {
          s.phase = "paused";
          s.notice = {
            tone: "info",
            title: "当前计划已完成",
            message: "剩余预算内没有其他可安排的作品，可结束导览或调整条件。",
          };
          return { state: s, actions };
        }
        s.phase = "walking";
        s.currentId = target.id;
        goTo(s, target.id, ctx, actions);
      }
      return { state: s, actions };
    }
    case "next": {
      if (s.phase === "listening" || s.phase === "dwelling") {
        const art = s.currentId ? artworkById(s.currentId) : null;
        return finishStop(
          s,
          ctx,
          actions,
          !!art && s.listenedThisStop + DWELL_TOLERANCE >= art.duration,
        );
      }
      return { state: s, actions };
    }
    case "skip": {
      const id = s.currentId;
      if (!id) return { state: s, actions };
      const art = artworkById(id);
      if (!art) return { state: s, actions };
      const listened = s.listenedThisStop;
      const dwell = s.dwellStart ? (ctx.now - s.dwellStart) / 1000 : 0;
      s.pending = null;
      const note =
        listened >= 1
          ? `已听 ${Math.round(listened)} 秒后主动跳过，未达到 ${art.minView} 秒最低观看时间`
          : "参观者主动跳过";
      s.manualSkips = [
        ...s.manualSkips.filter((x) => x.id !== id),
        { id, reason: "manual", note },
      ];
      if (s.settings.mustSee.includes(id)) {
        s.settings = {
          ...s.settings,
          mustSee: s.settings.mustSee.filter((x) => x !== id),
        };
        s.removedMustSee = [...new Set([...s.removedMustSee, id])];
      }
      s.completed = [
        ...s.completed.filter((c) => c.id !== id),
        {
          id,
          at: ctx.now,
          listenedSeconds: rt(listened),
          dwellSeconds: rt(dwell),
          narrationCompleted: false,
          skipped: true,
        },
      ];
      s.currentId = null;
      s.dwellStart = 0;
      s.listenedThisStop = 0;
      actions.push(
        { type: "hush" },
        { type: "visited", id, seconds: Math.round(Math.max(dwell, listened)), dwellSeconds: rt(dwell), narrationCompleted: false, skipped: true },
        { type: "skipped", id, reason: "manual", note },
      );
      // The skipped work must stay visible as an explicit skip even when the
      // planner rebuilds its own list from scratch.
      const fresh = planFor(s, ctx, {
        previousOrder: pendingOrder(s).filter((x) => x !== id),
      });
      fresh.skips = mergeSkips(fresh.skips, [
        { id, reason: "manual", note },
      ]);
      s.plan = fresh;
      s.signature = signatureOf(fresh);
      if (fresh.conflicts.length) {
        s.conflict = fresh;
        s.phase = "blocked";
        s.notice = {
          tone: "error",
          title: "跳过后的剩余路线存在冲突",
          message: fresh.conflicts[0].message,
        };
        actions.push({ type: "halt" });
        return { state: s, actions };
      }
      s.notice = {
        tone: "info",
        title: "已跳过并保留记录",
        message: `《${art.title}》记为主动跳过，收藏回顾会说明原因。`,
      };
      actions.push({ type: "plan", plan: fresh });
      return advance(s, ctx, actions);
    }
    case "restore": {
      if (!s.lastExecutable) return { state: s, actions };
      // Return to the previous executable plan, but only under the closures that
      // are in force *now*. We never pretend a physically closed area is open.
      const doneIds = completedSet(s);
      const forced = buildForcedPlan({
        ids: s.lastExecutable.stops
          .map((st) => st.id)
          .filter(
            (id) =>
              !doneIds.has(id) &&
              !s.manualSkips.some((k) => k.id === id),
          ),
        settings: s.settings,
        artworks: ctx.artworks,
        viewingPoint: ctx.view,
        from: ctx.from,
        elapsed: s.spent,
        revision: s.plan.revision + 1,
        skips: s.plan.skips,
      });
      s.plan = forced;
      s.signature = signatureOf(forced);
      s.pending = null;
      s.overshootReported = false;
      actions.push({ type: "plan", plan: forced });
      if (!forced.feasible) {
        s.conflict = forced;
        s.phase = "blocked";
        const names = forced.conflicts
          .flatMap((c) => c.ids)
          .map((id) => `《${artworkById(id)?.title ?? id}》`)
          .join("、");
        s.notice = {
          tone: "warning",
          title: "上一版计划在当前封闭下也无法完整执行",
          message:
            `原计划的顺序已恢复，但 ${names} 现在无法到达，因此不能直接继续。` +
            "请重新开放对应区域，或跳过这些作品后再继续。",
        };
        return { state: s, actions };
      }
      s.conflict = null;
      s.phase = "walking";
      const stillDone = completedSet(s);
      const target = forced.stops.find((st) => !stillDone.has(st.id));
      const over = Math.ceil(
        forced.totalSeconds - Math.max(0, s.settings.budgetSeconds - s.spent),
      );
      if (target) goTo(s, target.id, ctx, actions);
      s.notice = {
        tone: "warning",
        title: "已返回上一版可执行计划",
        message:
          `${forced.stops.length} 站 · 预计 ${Math.ceil(forced.totalSeconds)} 秒；` +
          `剩余预算 ${Math.max(0, Math.round(remainingOf(s)))} 秒` +
          (over > 0
            ? `，预计超出 ${over} 秒，可提高预算或跳过部分作品。`
            : "，仍在预算内。"),
      };
      return { state: s, actions };
    }
    case "journey": {
      s.settings = {
        ...s.settings,
        mustSee: [...new Set(event.mustSee)],
        budgetSeconds: event.budgetSeconds,
      };
      s.removedMustSee = [];
      const started = applyEvent(s, { type: "start" }, ctx);
      return {
        state: started.state,
        actions: [...actions, ...started.actions],
      };
    }
    case "end": {
      if (s.phase === "idle" || s.phase === "done")
        return { state: s, actions };
      return close(
        s,
        {
          tone: "info",
          title: "导览已结束",
          message: `本次完成 ${s.completed.length} 站，跳过 ${s.plan.skips.length} 件；收藏回顾会列出跳过原因。`,
        },
        actions,
      );
    }
    case "reset": {
      const settings = prev.settings;
      const fresh = createSession(ctx);
      if (event.keepSettings) {
        fresh.settings = settings;
        fresh.plan = buildPlan({
          settings,
          artworks: ctx.artworks,
          viewingPoint: ctx.view,
          from: ctx.from,
          completedIds: [],
          manualSkips: [],
          previousOrder: null,
          revision: 1,
        });
        fresh.conflict = fresh.plan.feasible ? null : fresh.plan;
        fresh.lastExecutable = fresh.plan.feasible ? fresh.plan : null;
        fresh.signature = signatureOf(fresh.plan);
      }
      actions.push({ type: "plan", plan: fresh.plan });
      return { state: fresh, actions };
    }
    default:
      return { state: s, actions };
  }
}

export function canRestore(s: SessionState) {
  return s.phase === "blocked" && !!s.lastExecutable;
}
