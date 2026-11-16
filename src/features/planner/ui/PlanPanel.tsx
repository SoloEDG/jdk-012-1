import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Footprints,
  Heart,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Square,
} from "lucide-react";
import type {
  Artwork,
  VisitNotice,
  VisitPlan,
  VisitSettings,
} from "../../../shared/types";
import { artworks, artworkById } from "../../../shared/catalog";
import { closureZones } from "../../../shared/zones";
import { skipLabel } from "../../collection/lib/recap";

const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export function PlanPanel({
  plan,
  conflict,
  settings,
  phase,
  currentId,
  completedIds,
  spent,
  notice,
  pending,
  onBudget,
  onMustSee,
  onZone,
  onStart,
  onPause,
  onResume,
  onNext,
  onSkip,
  onRestore,
  onEnd,
  onSelect,
  canRestore,
  mustSeeEditable,
}: {
  plan: VisitPlan;
  conflict: VisitPlan | null;
  settings: VisitSettings;
  phase: string;
  currentId: string | null;
  completedIds: string[];
  spent: number;
  notice: VisitNotice | null;
  pending: VisitNotice | null;
  onBudget: (seconds: number) => void;
  onMustSee: (id: string) => void;
  onZone: (id: string) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onNext: () => void;
  onSkip: () => void;
  onRestore: () => void;
  onEnd: () => void;
  onSelect: (id: string) => void;
  canRestore: boolean;
  mustSeeEditable: boolean;
}) {
  const active = conflict ?? plan;
  const done = new Set(completedIds);
  const remaining = settings.budgetSeconds - spent;
  const stops = active.stops;
  const chosen = useMemo(
    () => new Set(stops.map((s) => s.id)),
    [stops],
  );
  const skipped = active.skips.filter((s) => !done.has(s.id));
  const overBudget = active.totalSeconds > remaining;
  const running = phase === "walking" || phase === "listening" || phase === "dwelling";

  return (
    <section className="plan-panel" aria-label="参观计划">
      <div className="section-title">
        <Clock size={16} />
        <span>参观计划</span>
        <small>VISIT PLAN</small>
      </div>

      <div className="plan-budget">
        <div className="budget-top">
          <span>剩余预算</span>
          <strong data-testid="remaining-budget">{mmss(remaining)}</strong>
        </div>
        <input
          aria-label="参观时间预算（分钟）"
          type="range"
          min="1"
          max="90"
          step="1"
          value={Math.round(settings.budgetSeconds / 60)}
          onChange={(e) => onBudget(Number(e.target.value) * 60)}
        />
        <div className="budget-values">
          <span>已用 {mmss(spent)}</span>
          <span className="budget-adjust">
            <button
              aria-label="预算增加一分钟"
              onClick={() => onBudget(settings.budgetSeconds + 60)}
            >
              +1 分
            </button>
            <button
              aria-label="预算减少一分钟"
              onClick={() => onBudget(settings.budgetSeconds - 60)}
            >
              −1 分
            </button>
          </span>
        </div>
      </div>

      <div className="plan-metrics">
        <span>
          <Footprints size={13} />
          步行 {Math.ceil(active.walkSeconds)} 秒 · {active.totalDistance.toFixed(1)} 米
        </span>
        <span>
          <Heart size={13} />
          最低观看 {Math.ceil(active.viewSeconds)} 秒
        </span>
        <span className={overBudget ? "metric-over" : ""}>
          计划合计 {Math.ceil(active.totalSeconds)} 秒
          {overBudget ? " · 超出预算" : ""}
        </span>
      </div>

      {(active.conflicts.length > 0 || (conflict && conflict.conflicts.length)) && (
        <div className="plan-conflicts" role="alert">
          <AlertTriangle size={15} />
          <div>
            {(conflict ?? active).conflicts.map((c, i) => (
              <p key={c.kind + i}>{c.message}</p>
            ))}
            {conflict && (
              <p className="conflict-actions">
                必看作品不会从计划里消失；请增加预算、调整必看集合或重新开放区域。
              </p>
            )}
          </div>
        </div>
      )}

      {notice && (
        <div className={"plan-notice notice-" + notice.tone} role="status">
          <strong>{notice.title}</strong>
          <p>{notice.message}</p>
        </div>
      )}
      {pending && (
        <div className="plan-notice notice-pending" role="status">
          <strong>{pending.title}</strong>
          <p>{pending.message}</p>
        </div>
      )}

      <ol className="plan-stops">
        {stops.map((stop, i) => {
          const a = artworkById(stop.id);
          if (!a) return null;
          const isDone = done.has(stop.id);
          const isCurrent = currentId === stop.id;
          return (
            <li
              key={stop.id}
              className={
                "plan-stop" +
                (isDone ? " done" : "") +
                (isCurrent ? " current" : "")
              }
            >
              <span className="stop-index">{isDone ? "✓" : `0${i + 1}`}</span>
              <button className="stop-title" onClick={() => onSelect(stop.id)}>
                {a.title}
                <ArrowRight size={12} />
              </button>
              <small>
                步行 {Math.ceil(stop.travelSeconds)} 秒 · 观看 {stop.minView} 秒
                {stop.narration > stop.minView
                  ? "" 
                  : ` · 讲解 ${stop.narration} 秒`}
              </small>
              {!isDone && (
                <button
                  className={"must-toggle" + (settings.mustSee.includes(stop.id) ? " on" : "")}
                  aria-label={
                    (settings.mustSee.includes(stop.id) ? "移出必看：" : "设为必看：") +
                    a.title
                  }
                  aria-pressed={settings.mustSee.includes(stop.id)}
                  disabled={!mustSeeEditable}
                  onClick={() => onMustSee(stop.id)}
                >
                  {settings.mustSee.includes(stop.id) ? "必看 ✓" : "设为必看"}
                </button>
              )}
            </li>
          );
        })}
        {!stops.length && (
          <li className="plan-empty">当前条件下没有可安排的作品。</li>
        )}
      </ol>

      {skipped.length > 0 && (
        <div className="plan-skips">
          <span className="eyebrow">未安排 · {skipped.length} 件</span>
          {skipped.map((s) => (
            <div className="plan-skip" key={s.id}>
              <span>{artworkById(s.id)?.title}</span>
              <small>
                {skipLabel(s.reason)} · {s.note}
              </small>
            </div>
          ))}
        </div>
      )}

      <div className="plan-must">
        <span className="eyebrow">必看作品 · {settings.mustSee.length} 件</span>
        {settings.mustSee.length > 0 && (
          <ul className="must-audit" aria-label="必看作品安排情况">
            {settings.mustSee.map((id) => {
              const a = artworkById(id);
              if (!a) return null;
              const inPlan = chosen.has(id);
              const isDone = done.has(id);
              const skip = active.skips.find((s) => s.id === id);
              return (
                <li
                  key={id}
                  className={
                    "must-audit-row " +
                    (isDone
                      ? "audit-done"
                      : inPlan
                        ? "audit-planned"
                        : "audit-unplanned")
                  }
                >
                  <strong>{a.title}</strong>
                  <span>
                    {isDone
                      ? "已完成"
                      : inPlan
                        ? "已安排"
                        : skip
                          ? `未安排 · ${skipLabel(skip.reason)}`
                          : "未安排"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="must-chips">
          {artworks.map((a: Artwork) => {
            const on = settings.mustSee.includes(a.id);
            return (
              <button
                key={a.id}
                className={"chip" + (on ? " on" : "")}
                aria-pressed={on}
                aria-label={(on ? "移出必看：" : "设为必看：") + a.title}
                disabled={!mustSeeEditable}
                onClick={() => onMustSee(a.id)}
              >
                {a.title}
              </button>
            );
          })}
        </div>
      </div>

      <div className="plan-zones">
        <span className="eyebrow">临时封闭区域</span>
        <div className="zone-list">
          {closureZones.map((z) => {
            const closed = settings.closedZoneIds.includes(z.id);
            return (
              <button
                key={z.id}
                className={"zone" + (closed ? " closed" : "")}
                aria-pressed={closed}
                aria-label={(closed ? "重新开放：" : "临时封闭：") + z.name}
                title={z.note}
                onClick={() => onZone(z.id)}
              >
                {closed ? "封闭中" : "开放"} · {z.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="plan-actions">
        {phase === "idle" && (
          <button
            className="primary full"
            onClick={onStart}
            disabled={!!conflict}
          >
            按此计划开始
            <ArrowRight size={15} />
          </button>
        )}
        {running && (
          <>
            <button onClick={onPause}>
              <Pause size={14} /> 暂停
            </button>
            <button
              onClick={onNext}
              disabled={phase !== "listening" && phase !== "dwelling"}
            >
              下一站 <ArrowRight size={14} />
            </button>
            <button onClick={onSkip}>
              <SkipForward size={14} /> 跳过当前
            </button>
          </>
        )}
        {phase === "paused" && (
          <button onClick={onResume}>
            <Play size={14} /> 继续
          </button>
        )}
        {phase === "blocked" && canRestore && (
          <button onClick={onRestore}>
            <RotateCcw size={14} /> 返回上一版计划
          </button>
        )}
        {(running || phase === "paused" || phase === "blocked") && (
          <button onClick={onEnd}>
            <Square size={13} /> 结束
          </button>
        )}
        {phase === "done" && (
          <button className="primary full" onClick={onStart}>
            <RotateCcw size={14} /> 再走一次
          </button>
        )}
      </div>
      <CurrentHints phase={phase} currentId={currentId} plan={active} endsSoon={remaining <= 30} />
    </section>
  );
}

function CurrentHints({
  phase,
  currentId,
  plan,
  endsSoon,
}: {
  phase: string;
  currentId: string | null;
  plan: VisitPlan;
  endsSoon: boolean;
}) {
  const a = artworkById(currentId);
  const stop = plan.stops.find((s) => s.id === currentId);
  if (!a) return null;
  return (
    <div className="plan-current" aria-live="polite">
      <span className="eyebrow">
        {phase === "walking"
          ? "正在前往"
          : phase === "listening"
            ? "讲解中"
            : phase === "dwelling"
              ? "最低观看中"
              : phase === "blocked"
                ? "路线受阻"
                : "当前作品"}
      </span>
      <strong>{a.title}</strong>
      {stop && (
        <small>
          步行 {Math.ceil(stop.travelSeconds)} 秒 · 最低观看 {a.minView} 秒 · 讲解{" "}
          {a.duration} 秒
        </small>
      )}
      {endsSoon && phase !== "blocked" && (
        <small className="hint-warning">剩余预算不足 30 秒，讲解播完后可能结束。</small>
      )}
    </div>
  );
}


export function PlanSummary({
  plan,
  conflict,
  phase,
  remainingSeconds,
  currentId,
  onOpen,
}: {
  plan: VisitPlan;
  conflict: VisitPlan | null;
  phase: string;
  remainingSeconds: number;
  currentId: string | null;
  onOpen: () => void;
}) {
  const active = conflict ?? plan;
  const current = artworkById(currentId);
  return (
    <div className="plan-summary">
      <div className="plan-summary-head">
        <span className="eyebrow">VISIT PLAN · 参观计划</span>
        <strong>{mmss(remainingSeconds)}</strong>
      </div>
      <p>
        {active.stops.length} 站 · 步行 {Math.ceil(active.walkSeconds)} 秒 · 最低观看{" "}
        {Math.ceil(active.viewSeconds)} 秒
      </p>
      {conflict && (
        <p className="summary-warning">
          <AlertTriangle size={12} /> 必看作品与当前条件冲突
        </p>
      )}
      {current && <p className="summary-current">当前 · {current.title}</p>}
      <button className="text-button" onClick={onOpen}>
        {phase === "idle" ? "安排我的参观" : "查看参观计划"}
        <ArrowRight size={13} />
      </button>
      {phase !== "idle" && phase !== "done" && (
        <small className="summary-phase">
          {phase === "walking"
            ? "行走中 · 预算随实际步行更新"
            : phase === "listening"
              ? "讲解中 · 预算随播放更新"
              : phase === "dwelling"
                ? "最低观看中"
                : phase === "blocked"
                  ? "路线受阻，请查看计划"
                  : phase === "paused"
                    ? "已暂停"
                    : ""}
        </small>
      )}
    </div>
  );
}
