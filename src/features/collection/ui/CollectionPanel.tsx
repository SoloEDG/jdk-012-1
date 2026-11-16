import { Heart, Download, ArrowUpRight } from "lucide-react";
import type { GalleryDocument } from "../../../shared/types";
import { artworkById } from "../../../shared/catalog";
import {
  recapStats,
  createRecap,
  exploredSkips,
  skipLabel,
} from "../lib/recap";
import { downloadRecap } from "../lib/download";
export function CollectionPanel({
  document,
  onSelect,
  onNote,
  onToggle,
}: {
  document: GalleryDocument;
  onSelect: (id: string) => void;
  onNote: (id: string, text: string) => void;
  onToggle: (id: string) => void;
}) {
  const stats = recapStats(document);
  return (
    <div className="collection-panel">
      <div className="eyebrow">YOUR PERSONAL GALLERY</div>
      <h2>把共鸣，留在这里。</h2>
      <div className="stats">
        <span>
          <strong>{stats.seen}</strong>已观看
        </span>
        <span>
          <strong>{stats.saved}</strong>已收藏
        </span>
        <span>
          <strong>{Math.floor(stats.seconds / 60)}′</strong>停留时长
        </span>
      </div>
      <div className="recap-lists">
        <div className="recap-heading">
          <span>计划 {stats.planned} 站</span>
          <span>跳过 {stats.skipped} 件</span>
        </div>
        {exploredSkips(document).length > 0 && (
          <ul className="skip-list" aria-label="跳过作品与原因">
            {exploredSkips(document).map((s) => {
              const a = artworkById(s.id);
              if (!a) return null;
              return (
                <li key={s.id} className={"skip skip-" + s.reason}>
                  <strong>{a.title}</strong>
                  <span>{skipLabel(s.reason)}</span>
                  <small>{s.note}</small>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {document.favorites.length === 0 ? (
        <div className="empty">
          <Heart size={28} />
          <p>遇见喜欢的作品，点亮一颗心。</p>
          <small>你的参观故事，将从这里开始。</small>
        </div>
      ) : (
        document.favorites.map((id) => {
          const a = artworkById(id);
          if (!a) return null;
          return (
            <article className="saved-card" key={id}>
              <button className="saved-title" onClick={() => onSelect(id)}>
                {a.title}
                <ArrowUpRight size={15} />
              </button>
              <small>
                {a.artist} · {a.year}
              </small>
              <textarea
                aria-label={"感想-" + a.title}
                placeholder="写下此刻的感受…"
                value={document.notes[id] || ""}
                onChange={(e) => onNote(id, e.target.value)}
                maxLength={1000}
              />
              <button className="text-button" onClick={() => onToggle(id)}>
                移出收藏
              </button>
            </article>
          );
        })
      )}
      <button
        className="primary full"
        disabled={!stats.saved}
        onClick={() => downloadRecap(createRecap(document))}
      >
        <Download size={16} />
        生成个人参观回顾
      </button>
    </div>
  );
}
