import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
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

const LINK_COLORS = {
  series: "rgba(212, 132, 154, 0.55)",
  author: "rgba(201, 169, 97, 0.35)",
  tag: "rgba(183, 148, 244, 0.35)",
} as const;

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
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number; moved: boolean }>({
    active: false,
    lastX: 0,
    lastY: 0,
    moved: false,
  });
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

    // Obsidian-style dark canvas (consistent in light/dark shell).
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    bg.addColorStop(0, dark ? "#2a2220" : "#2e2824");
    bg.addColorStop(1, dark ? "#141110" : "#1a1615");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const { x: vx, y: vy, scale } = viewportRef.current;
    const cx = w / 2 + vx;
    const cy = h / 2 + vy;
    const labels = labelOpacity(scale);

    // Links
    const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));
    for (const link of layout.links) {
      const a = nodeById.get(link.source);
      const b = nodeById.get(link.target);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(cx + a.x * scale, cy + a.y * scale);
      ctx.lineTo(cx + b.x * scale, cy + b.y * scale);
      ctx.strokeStyle = LINK_COLORS[link.kind];
      ctx.lineWidth = link.kind === "series" ? 1.4 : 0.9;
      ctx.stroke();
    }

    // Nodes
    for (const node of layout.nodes) {
      const sx = cx + node.x * scale;
      const sy = cy + node.y * scale;
      const r = node.r * scale;

      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(r, 2), 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();

      if (dark) {
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
      } else {
        ctx.strokeStyle = "rgba(61, 43, 31, 0.15)";
      }
      ctx.lineWidth = 0.75;
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

  // Build layout once books are available.
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

  // Fit graph to viewport on first layout.
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
    const pad = 48;
    const scale = clamp(
      Math.min((rect.width - pad * 2) / gw, (rect.height - pad * 2) / gh),
      MIN_SCALE,
      1.2
    );
    viewportRef.current = { x: 0, y: 0, scale };
    scheduleDraw();
  }, [ready, scheduleDraw]);

  // Resize observer
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

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(e.clientX, e.clientY, factor);
    },
    [zoomAt]
  );

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.active) return;
      const dx = e.clientX - drag.lastX;
      const dy = e.clientY - drag.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      viewportRef.current.x += dx;
      viewportRef.current.y += dy;
      scheduleDraw();
    },
    [scheduleDraw]
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current.active = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchRef.current = { active: true, dist, scale: viewportRef.current.scale };
    }
  }, []);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
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
    [zoomAt]
  );

  const onTouchEnd = useCallback(() => {
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
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ touchAction: "none" }}
    >
      <header
        className={`pointer-events-none absolute inset-x-0 z-10 px-4 pt-[max(5.5rem,calc(env(safe-area-inset-top)+4rem))] sm:px-5`}
      >
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h2
              className={`font-display text-4xl font-semibold ${dark ? "text-white" : "text-espresso"}`}
            >
              Reading Map
            </h2>
            <p className={`mt-1 text-sm ${dark ? "text-white/55" : "text-espresso/55"}`}>
              {readCount} books · {stats.links} connections
              <span className="mx-2 opacity-40">·</span>
              scroll to zoom, drag to explore
            </p>
          </motion.div>

          <div
            className={`pointer-events-auto mt-4 flex flex-wrap gap-3 text-[11px] ${
              dark ? "text-white/45" : "text-espresso/50"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded-full bg-rose/60" />
              series
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded-full bg-gold/50" />
              author
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded-full bg-[#B794F4]/50" />
              tag
            </span>
          </div>
        </div>
      </header>

      <div
        ref={containerRef}
        className={`absolute inset-0 ${dark ? "bg-charcoal/40" : "bg-espresso/[0.03]"}`}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-grab active:cursor-grabbing"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className={`text-sm ${dark ? "text-white/50" : "text-espresso/50"}`}>
              Mapping your library…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
