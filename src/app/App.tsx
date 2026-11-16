import { useState } from "react";
import {
  ArrowUpRight,
  Heart,
  Maximize,
  MapPin,
  Volume2,
  Compass,
  Move,
  Info,
  X,
  ClipboardList,
} from "lucide-react";
import { Viewport, Map } from "../features/space";
import { PlanPanel, PlanSummary } from "../features/planner";
import { ArtworkList, ArtworkDetail } from "../features/catalog";
import { TourPanel } from "../features/tours";
import { AudioPlayer } from "../features/narration";
import { CollectionPanel } from "../features/collection";
import { artworks, artworkById } from "../shared/catalog";
import { useGallery } from "./useGallery";

export default function App() {
  const g = useGallery();
  const [tab, setTab] = useState("explore");
  const [mapOpen, setMapOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [side, setSide] = useState("works");
  const a = artworkById(g.catalog.active);
  const v = g.visit;
  const running =
    v.phase === "walking" || v.phase === "listening" || v.phase === "dwelling";
  const openPlan = () => setTab("plan");
  return (
    <div className="app">
      <header>
        <a className="brand" href="#">
          <span className="brand-mark">余</span>
          <span>
            余境<small>YUJING ART SPACE</small>
          </span>
        </a>
        <nav>
          <button
            className={tab === "explore" ? "selected" : ""}
            onClick={() => setTab("explore")}
          >
            探索展馆
          </button>
          <button
            className={tab === "plan" ? "selected" : ""}
            onClick={() => setTab("plan")}
          >
            参观计划
            {running && <span className="live-dot" />}
          </button>
          <button
            className={tab === "journeys" ? "selected" : ""}
            onClick={() => setTab("journeys")}
          >
            主题导览
          </button>
          <button
            className={tab === "collection" ? "selected" : ""}
            onClick={() => setTab("collection")}
          >
            我的收藏{" "}
            <span className="count">
              {g.collection.document.favorites.length}
            </span>
          </button>
        </nav>
        <div className="header-meta">
          <span className="live-dot" />
          线上展览 · 全天开放
          <button
            className="icon-button"
            aria-label="操作帮助"
            onClick={() => setHelp(true)}
          >
            <Info size={18} />
          </button>
        </div>
      </header>
      <main>
        <aside className="left-sidebar">
          <div className="exhibition-intro">
            <div className="eyebrow">
              CURRENT EXHIBITION <span>展览 001</span>
            </div>
            <h1>万物之间</h1>
            <p className="english-title">BETWEEN ALL THINGS</p>
            <p className="intro-text">
              当自然、空间与想象相遇
              <br />
              一场不受边界限制的艺术漫游。
            </p>
            <div className="exhibition-meta">
              <span>6 件作品</span>
              <span>6 位艺术家</span>
              <span>约 12 分钟</span>
            </div>
          </div>
          <div className="sidebar-tabs">
            <button
              className={side === "works" ? "active" : ""}
              onClick={() => setSide("works")}
            >
              展出作品 <small>06</small>
            </button>
            <button
              className={side === "map" ? "active" : ""}
              onClick={() => setSide("map")}
            >
              空间地图
            </button>
          </div>
          {side === "works" ? (
            <ArtworkList active={g.catalog.active} onSelect={g.go} />
          ) : (
            <Map
              position={g.walker.position}
              active={g.catalog.active}
              onSelect={g.go}
              plan={v.plan}
              closedZoneIds={v.settings.closedZoneIds}
              mustSee={v.settings.mustSee}
              large
            />
          )}
          <PlanSummary
            plan={v.plan}
            conflict={v.conflict}
            phase={v.phase}
            remainingSeconds={v.remainingSeconds}
            currentId={v.currentId}
            onOpen={openPlan}
          />
          <div className="sidebar-footer">
            <Compass size={15} />
            <span>慢下来，遇见艺术的另一面。</span>
          </div>
        </aside>
        <section className="center">
          <div className="view-heading">
            <div>
              <span className="eyebrow">THE VIRTUAL GALLERY</span>
              <h2>
                步入一场艺术的漫游<span>01 / 主展厅</span>
              </h2>
            </div>
            <button className="text-button" onClick={() => setHelp(true)}>
              参观指南
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="scene-wrap">
            <Viewport
              position={g.walker.positionRef}
              yaw={g.walker.yaw}
              onSelect={g.go}
            />
            <div className="scene-top">
              <span>
                <span className="live-dot" />
                {running
                  ? v.phase === "walking"
                    ? "按计划行走中"
                    : v.phase === "listening"
                      ? "作品讲解中"
                      : "最低观看时间"
                  : v.phase === "paused"
                    ? "参观计划已暂停"
                    : v.phase === "blocked"
                      ? "计划受阻 · 打开参观计划"
                      : "自由探索中"}
              </span>
              <button
                className="glass-button"
                aria-label="全屏展馆"
                onClick={() => {
                  const el = document.querySelector(".scene-wrap");
                  if (document.fullscreenElement)
                    void document.exitFullscreen();
                  else void el?.requestFullscreen();
                }}
              >
                <Maximize size={16} />
              </button>
            </div>
            <div className="center-cross">+</div>
            <div className="scene-location">
              <MapPin size={15} />
              {g.catalog.nearby ? a?.title : "万物之间 · 主展厅"}
              <small>
                {g.catalog.nearby
                  ? "靠近作品 · 可收听讲解"
                  : "拖动视角，发现你的下一次共鸣"}
              </small>
            </div>
            <div
              className="mini-map"
              onClick={() => setMapOpen(true)}
              role="button"
              tabIndex={0}
              aria-label="展开地图"
              onKeyDown={(e) => {
                if (e.key === "Enter") setMapOpen(true);
              }}
            >
              <span>空间导航 ↗</span>
              <Map
                position={g.walker.position}
                active={g.catalog.active}
                onSelect={g.go}
                plan={v.plan}
                closedZoneIds={v.settings.closedZoneIds}
                mustSee={v.settings.mustSee}
              />
            </div>
            <div className="scene-controls">
              <span>
                <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd> 行走
              </span>
              <span>
                <Move size={14} />
                拖动切换视角
              </span>
              <span>
                <Heart size={14} />
                收藏所见
              </span>
            </div>
          </div>
          <div className="scene-caption">
            <span>让每一次停留，都成为一次发现。</span>
            <span>
              沉浸式三维艺术体验 <Volume2 size={14} />
            </span>
          </div>
          <div className="discover-strip">
            <div>
              <span className="eyebrow">A MOMENT OF DISCOVERY</span>
              <h3>按剩余时间，安排这一程。</h3>
              <p>
                告诉余境你有多少时间、哪些作品必看、哪里临时封闭，它会算好步行与讲解，边走边更新。
              </p>
            </div>
            <button onClick={openPlan}>
              {v.phase === "idle" ? "安排我的参观" : "查看参观计划"}
              <ArrowUpRight size={19} />
            </button>
          </div>
          <div className="art-tags">
            {artworks.slice(0, 3).map((art, i) => (
              <button key={art.id} onClick={() => g.go(art.id)}>
                <span style={{ background: art.color }} />0{i + 1} · {art.title}
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        </section>
        <aside className="right-sidebar">
          {tab === "collection" ? (
            <CollectionPanel
              document={g.collection.document}
              onSelect={g.go}
              onNote={g.collection.note}
              onToggle={g.collection.toggle}
            />
          ) : tab === "plan" ? (
            <PlanPanel {...planProps(g)} />
          ) : tab === "journeys" ? (
            <>
              <div className="journey-intro">
                <div className="eyebrow">FOLLOW YOUR CURIOSITY</div>
                <h2>沿着共鸣，出发。</h2>
                <p>
                  固定主题只是起点：选择一组必看作品后，仍会按你的剩余时间、实际步行与讲解时长重新计算。
                </p>
              </div>
              <TourPanel
                activeId={null}
                disabled={running}
                onStartPreset={(mustSee, budgetSeconds) => {
                  g.visit.journey(mustSee, budgetSeconds);
                  setTab("plan");
                }}
              />
            </>
          ) : (
            <>
              <ArtworkDetail
                id={g.catalog.active}
                saved={g.collection.document.favorites.includes(
                  g.catalog.active || "",
                )}
                onFavorite={() => {
                  if (g.catalog.active) g.collection.toggle(g.catalog.active);
                }}
                onListen={() => {
                  if (g.catalog.active) g.narration.play(g.catalog.active);
                }}
                onGo={() => {
                  if (g.catalog.active) g.go(g.catalog.active);
                }}
              />
              <div className="detail-plan-link">
                <ClipboardList size={14} />
                <button className="text-button" onClick={openPlan}>
                  按时间安排参观计划
                  <ArrowUpRight size={13} />
                </button>
              </div>
            </>
          )}
          <div className="right-bottom">
            <span className="quote-mark">“</span>
            <p>
              艺术不是你看到的东西，
              <br />
              而是你让别人看到的东西。
            </p>
            <small>— 埃德加 · 德加</small>
          </div>
        </aside>
      </main>
      {g.collection.storageError && (
        <div className="storage-error">
          浏览器存储已满，本次更改暂未保存，请下载回顾。
        </div>
      )}
      <AudioPlayer
        state={g.narration.state}
        caption={g.narration.caption}
        supported={g.narration.supported}
        onToggle={g.narration.toggle}
        onSeek={g.narration.seek}
        onRate={g.narration.rate}
      />
      {(mapOpen || help) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setMapOpen(false);
            setHelp(false);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={help ? "参观指南" : "空间导航"}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="关闭弹窗"
              className="icon-button modal-close"
              onClick={() => {
                setMapOpen(false);
                setHelp(false);
              }}
            >
              <X size={20} />
            </button>
            <div className="eyebrow">YUJING ART SPACE</div>
            <h2>{help ? "按照自己的节奏，探索。" : "你在这里。"}</h2>
            {help ? (
              <>
                <p>使用 W / A / S / D 或方向键自由行走；拖动画面转动视角。</p>
                <p>
                  在“参观计划”里设定剩余时间、必看作品与临时封闭区域。计划会同时计算可行步行距离、每件作品的最低观看时间与讲解时长。
                </p>
                <p>
                  必看作品放不下时会明确提示冲突，不会悄悄漏掉；行走与讲解会实时消耗预算，路线会自动避开封闭区域而保持顺序稳定。
                </p>
                <p>
                  点击“跳过当前”会把作品记为主动跳过，收藏回顾中会解释原因；讲解播放中修改条件，会在当前讲解结束后才切换新计划。
                </p>
                <p>
                  讲解由设备的中文语音合成播放；没有中文语音时仍可阅读同步字幕。
                </p>
              </>
            ) : (
              <Map
                position={g.walker.position}
                active={g.catalog.active}
                onSelect={(id) => {
                  g.go(id);
                  setMapOpen(false);
                }}
                plan={v.plan}
                closedZoneIds={v.settings.closedZoneIds}
                mustSee={v.settings.mustSee}
                large
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function planProps(g: ReturnType<typeof useGallery>) {
  const v = g.visit;
  return {
    plan: v.plan,
    conflict: v.conflict,
    settings: v.settings,
    phase: v.phase,
    currentId: v.currentId,
    completedIds: v.finishedIds,
    spent: v.spent,
    notice: v.notice,
    pending: v.pending,
    canRestore: !!v.lastExecutable,
    mustSeeEditable: true,
    onBudget: v.setBudget,
    onMustSee: v.toggleMustSee,
    onZone: v.toggleZone,
    onStart: v.start,
    onPause: v.pause,
    onResume: v.resume,
    onNext: v.next,
    onSkip: v.skip,
    onRestore: v.restore,
    onEnd: v.end,
    onSelect: g.go,
  };
}
