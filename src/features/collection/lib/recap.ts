import type {
  GalleryDocument,
  PlanSkipReason,
  SkipRecord,
} from "../../../shared/types";
import { artworkById } from "../../../shared/catalog";

export const skipLabels: Record<PlanSkipReason, string> = {
  manual: "主动跳过",
  removed: "移出必看后未再安排",
  budget: "预算不足，未安排",
  closed: "区域临时封闭，无法到达",
  unreachable: "无法规划到达路线",
  ended: "导览提前结束，未参观",
};

export function skipLabel(reason: PlanSkipReason) {
  return skipLabels[reason] || "未安排";
}

export function recapStats(d: GalleryDocument) {
  // A work the visitor skipped may still have a few listened seconds; it must
  // not be counted as "watched" — the recap has to agree with the skip list.
  const skipped = new Set(d.skips.map((s) => s.id));
  const completed = d.visits.filter(
    (v) => v.seconds >= 2 && !skipped.has(v.id),
  );
  return {
    seen: completed.length,
    seconds: Math.round(d.visits.reduce((n, v) => n + v.seconds, 0)),
    saved: d.favorites.length,
    skipped: d.skips.length,
    planned: d.plan?.stops.length ?? 0,
  };
}

export function exploredSkips(d: GalleryDocument): SkipRecord[] {
  return d.skips.filter((s) => artworkById(s.id));
}

export function createRecap(d: GalleryDocument): string {
  const stats = recapStats(d);
  const planned = new Map(
    (d.plan?.stops || []).map((s) => [s.id, s] as const),
  );
  const lines = [
    "余境 · 我的参观回顾",
    `观看 ${stats.seen} 件作品 · 停留 ${stats.seconds} 秒 · 收藏 ${stats.saved} 件`,
  ];
  if (d.plan) {
    lines.push(
      `本次计划 ${stats.planned} 站 · 预算 ${Math.round(
        d.plan.budgetSeconds,
      )} 秒 · 预计步行 ${Math.round(d.plan.walkSeconds)} 秒 · 预计观看 ${Math.round(
        d.plan.viewSeconds,
      )} 秒`,
    );
  }
  lines.push("");
  lines.push("【收藏与感受】");
  if (!d.favorites.length) lines.push("还没有收藏作品。");
  for (const id of d.favorites) {
    const a = artworkById(id);
    if (!a) continue;
    const p = planned.get(id);
    lines.push(
      `${a.title} / ${a.artist}
${d.notes[id] || "未添加感想"}
停留 ${Math.round(d.visits.find((v) => v.id === id)?.seconds || 0)} 秒` +
        (p
          ? `（计划步行 ${Math.round(p.travelSeconds)} 秒 · 最低观看 ${
              p.minView
            } 秒）`
          : "（未列入本次计划）"),
    );
  }
  const skips = exploredSkips(d);
  if (skips.length) {
    lines.push("");
    lines.push("【被跳过的作品与原因】");
    for (const s of skips) {
      const a = artworkById(s.id);
      if (!a) continue;
      const plannedStop = planned.has(s.id);
      lines.push(
        `${a.title} — ${skipLabel(s.reason)}：${s.note}${
          plannedStop ? "（已列入计划但未完成）" : "（未列入计划）"
        }`,
      );
    }
  }
  const unplanned = (d.plan?.stops || [])
    .map((s) => s.id)
    .filter(
      (id) =>
        !d.skips.some((s) => s.id === id) &&
        !d.visits.some((v) => v.id === id && v.seconds >= 2),
    );
  if (unplanned.length) {
    lines.push("");
    lines.push("【计划中未完成】");
    for (const id of unplanned) {
      const a = artworkById(id);
      if (a) lines.push(`${a.title} — 计划内作品，本次未进入观看点`);
    }
  }
  return lines.join("\n\n");
}
