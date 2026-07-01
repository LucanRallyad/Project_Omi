import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LibraryBook } from "../types";
import { buildReadingGraph } from "../lib/bookGraph";
import { runForceLayout, type SimNode } from "../lib/forceLayout";

interface ReadingGraphProps {
  books: LibraryBook[];
  dark?: boolean;
}

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.15;
const MAX_SCALE = 4;
const LABEL_FADE_START = 0.55;
const LABEL_FADE_END = 1.35;

function linkColors(dark: boolean) {
  return dark
    ? {
        series: "rgba(212, 132, 154, 0.6)",
        author: "rgba(201, 169, 97, 0.45)",
        tag: "rgba(183, 148, 244, 0.45)",
      }
    : {
        series: "rgba(212, 132, 154, 0.7)",
        author: "rgba(201, 169, 97, 0.55)",
        tag: "rgba(183, 148, 244, 0.5)",
      };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function labelOpacity(scale: number): number {
  return clamp((scale - LABEL_FADE_START) / (LABEL_FADE_END - LABEL_FADE_START), 0, 1);
}

export function ReadingGraph({ books, dark = false }: ReadingGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<{ nodes: SimNode[]; links: ReturnType<typeof buildReadingGraph>["links"] } | null>(
    null
  );
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 });
  const panRef = useRef<{
    active: boolean;
    pointerId: number | null;
    lastX: number;
    lastY: number;
  }>({ active: false, pointerId: null, lastX: 0, lastY: 0 });
  const pinchRef = useRef<{ active: boolean; dist: number; scale: number }>({
    active: false,
    dist: 0,
    scale: 1,
  });
  const rafRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState({ nodes: 0, links: 0 });

  const readCount = useMemo(
    () => books.filter((b) => b.status === "read").length,
    [books]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const layout = layoutRef.current;
    if (!canvas || !layout) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { x: vx, y: vy, scale } = viewportRef.current;
    const cx = w / 2 + vx;
    const cy = h / 2 + vy;
    const labels = labelOpacity(scale);
    const links = linkColors(dark);

    const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));
    for (const link of layout.links) {
      const a = nodeById.get(link.source);
      const b = nodeById.get(link.target);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(cx + a.x * scale, cy + a.y * scale);
      ctx.lineTo(cx + b.x * scale, cy + b.y * scale);
      ctx.strokeStyle = links[link.kind];
      ctx.lineWidth = link.kind === "series" ? 1.5 : 1;
      ctx.stroke();
    }

    for (const node of layout.nodes) {
      const sx = cx + node.x * scale;
      const sy = cy + node.y * scale;
      const r = node.r * scale;

      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(r, 2.5), 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();

      ctx.strokeStyle = dark ? "rgba(255,255,255,0.18)" : "rgba(61, 43, 31, 0.2)";
      ctx.lineWidth = 0.85;
      ctx.stroke();

      if (labels > 0.02 && r >= 3) {
        const alpha = labels * clamp(r / 8, 0.35, 1);
        ctx.font = `${Math.round(clamp(10 + r * 0.35, 10, 14))}px "DM Sans", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = dark
          ? `rgba(255, 248, 242, ${alpha * 0.92})`
          : `rgba(61, 43, 31, ${alpha * 0.88})`;
        const label = node.title.length > 28 ? `${node.title.slice(0, 26)}…` : node.title;
        ctx.fillText(label, sx, sy + r + 3);
      }
    }
  }, [dark]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  useEffect(() => {
    setReady(false);
    const id = requestAnimationFrame(() => {
      const graph = buildReadingGraph(books);
      layoutRef.current = runForceLayout(graph.nodes, graph.links);
      setStats({ nodes: graph.nodes.length, links: graph.links.length });
      setReady(true);
      scheduleDraw();
    });
    return () => cancelAnimationFrame(id);
  }, [books, scheduleDraw]);

  useEffect(() => {
    if (!ready || !layoutRef.current || !containerRef.current) return;
    const layout = layoutRef.current;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of layout.nodes) {
      minX = Math.min(minX, n.x - n.r);
      maxX = Math.max(maxX, n.x + n.r);
      minY = Math.min(minY, n.y - n.r);
      maxY = Math.max(maxY, n.y + n.r);
    }
    const gw = maxX - minX || 1;
    const gh = maxY - minY || 1;
    const rect = containerRef.current.getBoundingClientRect();
    const pad = 32;
    const scale = clamp(
      Math.min((rect.width - pad * 2) / gw, (rect.height - pad * 2) / gh),
      MIN_SCALE,
      1.2
    );
    viewportRef.current = { x: 0, y: 0, scale };
    scheduleDraw();
  }, [ready, scheduleDraw]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => scheduleDraw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [scheduleDraw]);

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left - rect.width / 2;
      const py = clientY - rect.top - rect.height / 2;
      const vp = viewportRef.current;
      const newScale = clamp(vp.scale * factor, MIN_SCALE, MAX_SCALE);
      const ratio = newScale / vp.scale;
      vp.x = px - (px - vp.x) * ratio;
      vp.y = py - (py - vp.y) * ratio;
      vp.scale = newScale;
      scheduleDraw();
    },
    [scheduleDraw]
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      viewportRef.current.x += dx;
      viewportRef.current.y += dy;
      scheduleDraw();
    },
    [scheduleDraw]
  );

  // Native wheel listener — React's onWheel can't always preventDefault (passive).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(e.clientX, e.clientY, factor);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    panRef.current = {
      active: true,
      pointerId: e.pointerId,
      lastX: e.clientX,
      lastY: e.clientY,
    };
    containerRef.current?.setPointerCapture(e.pointerId);
    if (containerRef.current) containerRef.current.style.cursor = "grabbing";
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const pan = panRef.current;
      if (!pan.active || pan.pointerId !== e.pointerId) return;
      const dx = e.clientX - pan.lastX;
      const dy = e.clientY - pan.lastY;
      pan.lastX = e.clientX;
      pan.lastY = e.clientY;
      panBy(dx, dy);
    },
    [panBy]
  );

  const endPan = useCallback((e: React.PointerEvent) => {
    const pan = panRef.current;
    if (pan.pointerId !== e.pointerId) return;
    pan.active = false;
    pan.pointerId = null;
    if (containerRef.current) {
      containerRef.current.style.cursor = "grab";
      try {
        containerRef.current.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      panRef.current = {
        active: true,
        pointerId: null,
        lastX: t.clientX,
        lastY: t.clientY,
      };
    } else if (e.touches.length === 2) {
      panRef.current.active = false;
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchRef.current = { active: true, dist, scale: viewportRef.current.scale };
    }
  }, []);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1 && panRef.current.active && !pinchRef.current.active) {
        e.preventDefault();
        const t = e.touches[0];
        const dx = t.clientX - panRef.current.lastX;
        const dy = t.clientY - panRef.current.lastY;
        panRef.current.lastX = t.clientX;
        panRef.current.lastY = t.clientY;
        panBy(dx, dy);
        return;
      }
      if (e.touches.length !== 2 || !pinchRef.current.active) return;
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const midX = (a.clientX + b.clientX) / 2;
      const midY = (a.clientY + b.clientY) / 2;
      const factor = dist / pinchRef.current.dist;
      const target = clamp(pinchRef.current.scale * factor, MIN_SCALE, MAX_SCALE);
      const current = viewportRef.current.scale;
      if (Math.abs(target - current) > 0.001) {
        zoomAt(midX, midY, target / current);
      }
    },
    [panBy, zoomAt]
  );

  const onTouchEnd = useCallback(() => {
    panRef.current.active = false;
    pinchRef.current.active = false;
  }, []);

  if (readCount === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 pt-20">
        <p className={`text-center text-sm ${dark ? "text-white/50" : "text-espresso/50"}`}>
          No finished reads yet — books marked as read on Goodreads will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Legend — sits directly under the nav pill, pointer-events-none so pan works through it */}
      <div
        className="pointer-events-none fixed left-1/2 z-[55] -translate-x-1/2"
        style={{ top: "calc(max(1rem, env(safe-area-inset-top)) + 3.25rem)" }}
      >
        <div
          className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full px-3.5 py-1.5 text-[11px] shadow-soft ${
            dark ? "glass-dark text-white/50" : "glass text-espresso/55"
          }`}
        >
          <span className={dark ? "text-white/65" : "text-espresso/70"}>
            {readCount} books · {stats.links} links
          </span>
          <span className={`hidden h-3 w-px sm:block ${dark ? "bg-white/15" : "bg-espresso/15"}`} />
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3.5 rounded-full bg-rose/70" />
            series
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3.5 rounded-full bg-gold/60" />
            author
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3.5 rounded-full bg-[#B794F4]/60" />
            tag
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="absolute inset-0 cursor-grab select-none"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <canvas ref={canvasRef} className="pointer-events-none h-full w-full" />

        {!ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className={`text-sm ${dark ? "text-white/50" : "text-espresso/50"}`}>
              Mapping your library…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
