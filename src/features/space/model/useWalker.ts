import { useState, useRef, useEffect } from "react";
import type { Point, VisitZone } from "../../../shared/types";
import { containsPoint, inflate, WALKER_RADIUS } from "../../../shared/zones";
import { approach, constrain } from "../lib/motion";
export function useWalker(
  onPosition: (p: Point) => void,
  onManualMove?: () => void,
) {
  const [position, setPosition] = useState<Point>({ x: 3, z: 6.5 });
  const positionRef = useRef(position);
  const target = useRef<Point | null>(null);
  const path = useRef<Point[]>([]);
  const obstacles = useRef<VisitZone[]>([]);
  const keys = useRef(new Set<string>());
  const yaw = useRef(0);
  const callback = useRef(onPosition);
  callback.current = onPosition;
  const manual = useRef(onManualMove);
  manual.current = onManualMove;
  const setObstacles = (zones: VisitZone[]) => {
    obstacles.current = zones;
  };
  const setPath = (points: Point[]) => {
    path.current = points.map((p) => ({ ...p }));
    target.current = path.current[0] || null;
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
        ].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        keys.current.add(e.key.toLowerCase());
        if (target.current || path.current.length) {
          target.current = null;
          path.current = [];
          manual.current?.();
        }
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    let last = performance.now();
    let frame = 0;
    const blockedAt = (p: Point) =>
      obstacles.current.some((z) =>
        containsPoint(inflate(z, WALKER_RADIUS), p),
      );
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      let p = positionRef.current;
      const k = keys.current;
      if (target.current) {
        const nextStep = approach(p, target.current, dt);
        p = blockedAt(nextStep) ? p : nextStep;
        if (
          path.current.length &&
          Math.hypot(p.x - target.current.x, p.z - target.current.z) < 0.05
        ) {
          path.current.shift();
          target.current = path.current[0] || null;
        }
      } else {
        const f =
          Number(k.has("w") || k.has("arrowup")) -
          Number(k.has("s") || k.has("arrowdown"));
        const s =
          Number(k.has("d") || k.has("arrowright")) -
          Number(k.has("a") || k.has("arrowleft"));
        const length = Math.hypot(f, s) || 1;
        const stepX =
          ((s * Math.cos(yaw.current) - f * Math.sin(yaw.current)) *
            dt *
            2.5) /
          length;
        const stepZ =
          ((-f * Math.cos(yaw.current) - s * Math.sin(yaw.current)) *
            dt *
            2.5) /
          length;
        const candidate = constrain({ x: p.x + stepX, z: p.z + stepZ });
        if (!blockedAt(candidate)) p = candidate;
        else {
          const slideX = constrain({ x: p.x + stepX, z: p.z });
          const slideZ = constrain({ x: p.x, z: p.z + stepZ });
          if (!blockedAt(slideX)) p = slideX;
          else if (!blockedAt(slideZ)) p = slideZ;
        }
      }
      if (
        Math.hypot(p.x - positionRef.current.x, p.z - positionRef.current.z) >
        0.0001
      ) {
        positionRef.current = p;
        setPosition(p);
        callback.current(p);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  return {
    position,
    positionRef,
    yaw,
    go: (p: Point) => {
      path.current = [];
      target.current = p;
    },
    goPath: setPath,
    setObstacles,
    stop: () => {
      target.current = null;
      path.current = [];
    },
  };
}
