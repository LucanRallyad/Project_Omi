import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { LibraryBook } from "../types";
import { buildReadingGraph } from "../lib/bookGraph";
import { GraphSimulation, type SimNode } from "../lib/graphSimulation";
import {
  OBSIDIAN_COLORS,
  OBSIDIAN_DISPLAY,
  obsidianHitPadding,
  obsidianLabelOpacity,
  obsidianLinkWidth,
  obsidianTextFadeForViewport,
} from "../lib/obsidianGraphConfig";
import { useViewport } from "../hooks/useViewport";

interface ReadingGraphProps {
  books: LibraryBook[];
  syncedAt?: string | null;
}

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 6;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function ReadingGraph({ books, syncedAt }: ReadingGraphProps) {
  const { isMobile } = useViewport();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<GraphSimulation | null>(null);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 });
  const fittedRef = useRef(false);
  const hoverRef = useRef<string | null>(null);

  const panRef = useRef<{
    mode: "idle" | "pan" | "node";
    pointerId: number | null;
    lastX: number;
    lastY: number;
    node: SimNode | null;
  }>({ mode: "idle", pointerId: null, lastX: 0, lastY: 0, node: null });

  const pinchRef = useRef<{ active: boolean; dist: number; scale: number }>({
    active: false,
    dist: 0,
    scale: 1,
  });
  const physicsFrameRef = useRef(0);

  const textFade = obsidianTextFadeForViewport(isMobile);

  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState({ nodes: 0, links: 0 });

  const readCount = useMemo(
    () => books.filter((b) => b.status === "read").length,
    [books]
  );

  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const { x: vx, y: vy, scale } = viewportRef.current;
    const cx = rect.width / 2 + vx;
    const cy = rect.height / 2 + vy;
    return {
      x: (clientX - rect.left - cx) / scale,
      y: (clientY - rect.top - cy) / scale,
    };
  }, []);

  const hitTestNode = useCallback(
    (clientX: number, clientY: number): SimNode | null => {
      const sim = simRef.current;
      if (!sim) return null;
      const { x: wx, y: wy } = screenToWorld(clientX, clientY);
      const { scale } = viewportRef.current;
      let best: SimNode | null = null;
      let bestDist = Infinity;
      for (const node of sim.nodes) {
        const hitR = node.r + obsidianHitPadding(isMobile, scale);
        const d = Math.hypot(node.x - wx, node.y - wy);
        if (d <= hitR && d < bestDist) {
          best = node;
          bestDist = d;
        }
      }
      return best;
    },
    [screenToWorld, isMobile]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;

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

    // Obsidian workspace background.
    ctx.fillStyle = OBSIDIAN_COLORS.background;
    ctx.fillRect(0, 0, w, h);

    const { x: vx, y: vy, scale } = viewportRef.current;
    const cx = w / 2 + vx;
    const cy = h / 2 + vy;
    const hoverId = hoverRef.current;
    const highlight = hoverId ? sim.neighborsOf(hoverId) : null;
    const linkW = obsidianLinkWidth(isMobile);

    // Links — dim everything when hovering, highlight connected edges.
    for (const { a, b } of sim.simLinks) {
      const connected =
        !highlight || (highlight.has(a.id) && highlight.has(b.id));
      ctx.beginPath();
      ctx.moveTo(cx + a.x * scale, cy + a.y * scale);
      ctx.lineTo(cx + b.x * scale, cy + b.y * scale);
      ctx.strokeStyle = connected ? OBSIDIAN_COLORS.lineHighlight : OBSIDIAN_COLORS.dimLine;
      ctx.globalAlpha = connected ? (highlight ? 1 : 0.55) : 1;
      ctx.lineWidth = connected && highlight ? linkW * 1.4 : linkW;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Nodes.
    for (const node of sim.nodes) {
      const sx = cx + node.x * scale;
      const sy = cy + node.y * scale;
      const screenR = node.r * scale * OBSIDIAN_DISPLAY.nodeSizeMultiplier;
      const isHighlight = highlight?.has(node.id);
      const isHovered = node.id === hoverId;
      const dimmed = highlight && !isHighlight;

      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(screenR, 2), 0, Math.PI * 2);
      ctx.fillStyle = dimmed
        ? OBSIDIAN_COLORS.dimNode
        : isHovered || isHighlight
          ? OBSIDIAN_COLORS.nodeHighlight
          : node.color;
      ctx.fill();

      ctx.strokeStyle = dimmed ? "transparent" : OBSIDIAN_COLORS.nodeCircle;
      ctx.lineWidth = isHovered ? 1.2 : 0.75;
      ctx.stroke();

      const labelAlpha = obsidianLabelOpacity(node.r, scale, textFade);
      if (labelAlpha > 0.01) {
        const alpha = dimmed ? labelAlpha * 0.12 : labelAlpha;
        const fontSize = isMobile
          ? Math.round(clamp(10 + screenR * 0.12, 10, 13))
          : Math.round(clamp(11 + screenR * 0.15, 11, 14));
        ctx.font = `400 ${fontSize}px "Inter", "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = dimmed ? OBSIDIAN_COLORS.dimText : OBSIDIAN_COLORS.text;
        ctx.globalAlpha = alpha;
        const maxLen = isMobile ? 28 : 36;
        const label =
          node.title.length > maxLen ? `${node.title.slice(0, maxLen - 1)}…` : node.title;
        ctx.fillText(label, sx, sy + Math.max(screenR, 2) + (isMobile ? 3 : 4));
        ctx.globalAlpha = 1;
      }
    }
  }, [isMobile, textFade]);

  useEffect(() => {
    let running = true;
    const frame = () => {
      if (!running) return;
      physicsFrameRef.current += 1;
      const sim = simRef.current;
      if (sim) {
        const shouldTick = !isMobile || physicsFrameRef.current % 2 === 0 || sim.alpha > 0.08;
        if (shouldTick) sim.tick();
      }
      draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return () => {
      running = false;
    };
  }, [draw, isMobile]);

  useEffect(() => {
    fittedRef.current = false;
    setReady(false);
    const graph = buildReadingGraph(books);
    simRef.current = new GraphSimulation(graph.nodes, graph.links);
    setStats({ nodes: graph.nodes.length, links: graph.links.length });
    setReady(true);
  }, [books]);

  const fitToView = useCallback(() => {
    const sim = simRef.current;
    const container = containerRef.current;
    if (!sim || !container) return;
    const { minX, maxX, minY, maxY } = sim.bounds();
    const gw = maxX - minX || 1;
    const gh = maxY - minY || 1;
    const rect = container.getBoundingClientRect();
    const pad = isMobile ? 28 : 60;
    const scale = clamp(
      Math.min((rect.width - pad * 2) / gw, (rect.height - pad * 2) / gh),
      MIN_SCALE,
      isMobile ? 1.2 : 1
    );
    viewportRef.current = { x: 0, y: 0, scale };
    fittedRef.current = true;
  }, [isMobile]);

  useEffect(() => {
    if (!ready || fittedRef.current) return;
    requestAnimationFrame(() => fitToView());
  }, [ready, fitToView]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      if (!fittedRef.current) fitToView();
      draw();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw, fitToView]);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
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
    simRef.current?.reheat(0.1);
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
    },
    [zoomAt]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.08 : 1 / 1.08);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Obsidian arrow-key pan (+/- zoom).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const step = e.shiftKey ? 48 : 16;
      const vp = viewportRef.current;
      switch (e.key) {
        case "ArrowLeft":
          vp.x += step;
          break;
        case "ArrowRight":
          vp.x -= step;
          break;
        case "ArrowUp":
          vp.y += step;
          break;
        case "ArrowDown":
          vp.y -= step;
          break;
        case "+":
        case "=":
          zoomBy(1.12);
          return;
        case "-":
          zoomBy(1 / 1.12);
          return;
        default:
          return;
      }
      simRef.current?.reheat(0.08);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomBy]);

  const pointersRef = useRef(new Map<number, { x: number; y: number }>());

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointersRef.current.size === 2) {
        panRef.current = { mode: "idle", pointerId: null, lastX: 0, lastY: 0, node: null };
        const pts = [...pointersRef.current.values()];
        pinchRef.current = {
          active: true,
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          scale: viewportRef.current.scale,
        };
        containerRef.current?.setPointerCapture(e.pointerId);
        return;
      }

      const hit = hitTestNode(e.clientX, e.clientY);
      if (hit && simRef.current) {
        const { x, y } = screenToWorld(e.clientX, e.clientY);
        simRef.current.pinNode(hit, x, y);
        panRef.current = {
          mode: "node",
          pointerId: e.pointerId,
          lastX: e.clientX,
          lastY: e.clientY,
          node: hit,
        };
      } else {
        panRef.current = {
          mode: "pan",
          pointerId: e.pointerId,
          lastX: e.clientX,
          lastY: e.clientY,
          node: null,
        };
      }
      containerRef.current?.setPointerCapture(e.pointerId);
      if (containerRef.current) containerRef.current.style.cursor = "grabbing";
    },
    [hitTestNode, screenToWorld]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (pinchRef.current.active && pointersRef.current.size >= 2) {
        const pts = [...pointersRef.current.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const target = clamp(
          pinchRef.current.scale * (dist / pinchRef.current.dist),
          MIN_SCALE,
          MAX_SCALE
        );
        zoomAt(midX, midY, target / viewportRef.current.scale);
        return;
      }

      const hit = hitTestNode(e.clientX, e.clientY);
      hoverRef.current = hit?.id ?? null;

      const pan = panRef.current;
      if (pan.mode === "idle" || pan.pointerId !== e.pointerId) return;

      const dx = e.clientX - pan.lastX;
      const dy = e.clientY - pan.lastY;
      pan.lastX = e.clientX;
      pan.lastY = e.clientY;

      if (pan.mode === "node" && pan.node && simRef.current) {
        const { x, y } = screenToWorld(e.clientX, e.clientY);
        simRef.current.pinNode(pan.node, x, y);
      } else if (pan.mode === "pan") {
        viewportRef.current.x += dx;
        viewportRef.current.y += dy;
      }
    },
    [hitTestNode, screenToWorld, zoomAt]
  );

  const endPan = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current.active = false;

    const pan = panRef.current;
    if (pan.pointerId === e.pointerId && pan.mode === "node" && pan.node && simRef.current) {
      simRef.current.unpinNode(pan.node);
    }
    if (pan.pointerId === e.pointerId) {
      panRef.current = { mode: "idle", pointerId: null, lastX: 0, lastY: 0, node: null };
    }
    if (containerRef.current) {
      containerRef.current.style.cursor = "grab";
      try {
        containerRef.current.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const onPointerLeave = useCallback(() => {
    hoverRef.current = null;
  }, []);

  const navOffset = isMobile
    ? "calc(max(0.75rem, env(safe-area-inset-top)) + 3.5rem)"
    : "calc(max(1rem, env(safe-area-inset-top)) + 3.25rem)";
  const controlSize = isMobile ? "h-11 w-11" : "h-8 w-8";
  const controlBottom = isMobile
    ? "max(5.5rem, calc(env(safe-area-inset-bottom) + 1rem))"
    : "max(1rem, env(safe-area-inset-bottom))";

  if (readCount === 0) {
    return (
      <div
        className="flex h-full items-center justify-center px-6 pt-20"
        style={{ background: OBSIDIAN_COLORS.background, color: OBSIDIAN_COLORS.controlsText }}
      >
        <p className="text-center text-sm opacity-60">
          No finished reads yet — books marked as read on Goodreads will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: OBSIDIAN_COLORS.background }}>
      {/* Legend strip — Obsidian-style control bar under nav */}
      <div
        className="pointer-events-none fixed left-1/2 z-[55] -translate-x-1/2 rounded-md border px-3 py-1.5 text-[11px]"
        style={{
          top: "calc(max(1rem, env(safe-area-inset-top)) + 3.25rem)",
          background: OBSIDIAN_COLORS.controlsBg,
          borderColor: OBSIDIAN_COLORS.controlsBorder,
          color: OBSIDIAN_COLORS.controlsText,
        }}
      >
        <span className="opacity-80">
          {readCount} notes · {stats.links} links
          {syncedAt && (
            <>
              <span className="mx-2 opacity-30">|</span>
              <span className="opacity-50">
                synced {new Date(syncedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </>
          )}
        </span>
        <span className="mx-2 opacity-30">|</span>
        <span className="opacity-50">scroll / +/- zoom · drag to pan · drag nodes</span>
      </div>

      {/* Zoom controls — Obsidian bottom-right */}
      <div
        className="pointer-events-auto fixed z-[55] flex flex-col overflow-hidden rounded-md border shadow-lg"
        style={{
          right: "max(1rem, env(safe-area-inset-right))",
          bottom: "max(1rem, env(safe-area-inset-bottom))",
          borderColor: OBSIDIAN_COLORS.controlsBorder,
          background: OBSIDIAN_COLORS.controlsBg,
        }}
      >
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoomBy(1.15)}
          className="flex h-8 w-8 items-center justify-center transition-colors hover:bg-white/5"
          style={{ color: OBSIDIAN_COLORS.controlsText }}
        >
          <Plus size={16} />
        </button>
        <div className="h-px" style={{ background: OBSIDIAN_COLORS.controlsBorder }} />
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoomBy(1 / 1.15)}
          className="flex h-8 w-8 items-center justify-center transition-colors hover:bg-white/5"
          style={{ color: OBSIDIAN_COLORS.controlsText }}
        >
          <Minus size={16} />
        </button>
      </div>

      <div
        ref={containerRef}
        className="absolute inset-0 cursor-grab select-none"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onPointerLeave={onPointerLeave}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <canvas ref={canvasRef} className="pointer-events-none h-full w-full" />

        {!ready && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm opacity-50"
            style={{ color: OBSIDIAN_COLORS.controlsText }}
          >
            Loading graph…
          </div>
        )}
      </div>
    </div>
  );
}
