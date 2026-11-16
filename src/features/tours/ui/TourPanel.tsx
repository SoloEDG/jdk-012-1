import { Route, Play } from "lucide-react";
import { artworkById } from "../../../shared/catalog";
import { journeyPresets } from "../lib/presets";

export function TourPanel({
  onStartPreset,
  activeId,
  disabled,
}: {
  onStartPreset: (mustSee: string[], budgetSeconds: number) => void;
  activeId: string | null;
  disabled?: boolean;
}) {
  const presets = journeyPresets();
  return (
    <section className="tour-panel">
      <div className="section-title">
        <Route size={16} />
        <span>主题导览</span>
        <small>PRESETS</small>
      </div>
      {presets.map((r, i) => {
        const current = activeId === r.id;
        return (
          <div
            className={
              "route-card route-" + i + (current ? " route-active" : "")
            }
            key={r.id}
          >
            <span>
              JOURNEY 0{i + 1}
              <span>
                {r.stops.length} 件 · 最低观看 {Math.ceil(r.minViewSeconds / 60)} 分
              </span>
            </span>
            <h3>{r.name}</h3>
            <p>{r.subtitle}</p>
            <p className="preset-stops">
              {r.stops.map((id) => artworkById(id)?.title).join(" · ")}
            </p>
            <button
              className="preset-start"
              disabled={disabled}
              aria-label={`以主题导览开始：${r.name}`}
              onClick={() => onStartPreset(r.stops, r.budgetSeconds)}
            >
              <Play size={12} />
              以此为必看开始
            </button>
          </div>
        );
      })}
      <p className="preset-hint">
        也可以不使用预设：在“参观计划”里按剩余时间、必看作品和临时封闭区域自由安排。
      </p>
    </section>
  );
}
