import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  type PanInfo,
} from "framer-motion";
import type { Book } from "../types";
import { BookCard } from "./BookCard";

export type SwipeAction = "like" | "pass" | "skip";

export interface SwipeCardHandle {
  trigger: (action: SwipeAction) => void;
}

interface SwipeCardProps {
  book: Book;
  coverUrl: string | null;
  saved: boolean;
  onToggleSave: () => void;
  onCommit: (action: SwipeAction) => void;
  onOpenDetail: () => void;
  layoutId?: string;
  reducedMotion: boolean;
  isMobile?: boolean;
  cardHeight?: number;
}

const H_THRESHOLD = 120;
const V_THRESHOLD = 90;
const AXIS_LOCK = 14;

const EXIT_SPRING = { type: "spring" as const, stiffness: 220, damping: 28, mass: 0.85 };
const SNAP_SPRING = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.75 };

/**
 * Center card gestures: horizontal = like/pass; vertical up = skip (mobile only).
 * The card tracks your finger during drag, then flings off or snaps back.
 */
export const SwipeCard = forwardRef<SwipeCardHandle, SwipeCardProps>(function SwipeCard(
  {
    book,
    coverUrl,
    saved,
    onToggleSave,
    onCommit,
    onOpenDetail,
    layoutId,
    reducedMotion,
    isMobile = false,
    cardHeight = 520,
  },
  ref
) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [exiting, setExiting] = useState(false);
  const dragAxis = useRef<"x" | "y" | null>(null);

  const rotateZ = useTransform(x, [-320, 0, 320], [-28, 0, 28]);
  const likeOpacity = useTransform(x, [40, 140], [0, 1]);
  const passOpacity = useTransform(x, [-140, -40], [1, 0]);

  useImperativeHandle(ref, () => ({
    trigger(action) {
      if (!exiting) flingOff(action);
    },
  }));

  function flingOff(action: SwipeAction) {
    setExiting(true);

    const currentY = y.get();
    const target =
      action === "like"
        ? { x: 640, y: currentY + 40 }
        : action === "pass"
          ? { x: -640, y: currentY + 40 }
          : { x: 0, y: -cardHeight * 1.35 };

    animate(x, target.x, EXIT_SPRING);
    animate(y, target.y, {
      ...EXIT_SPRING,
      onComplete: () => onCommit(action),
    });
  }

  function handleDragStart() {
    dragAxis.current = null;
  }

  function handleDrag(_: unknown, info: PanInfo) {
    if (exiting) return;

    if (dragAxis.current === null) {
      const { offset } = info;
      if (Math.abs(offset.x) > AXIS_LOCK || Math.abs(offset.y) > AXIS_LOCK) {
        dragAxis.current = Math.abs(offset.x) > Math.abs(offset.y) ? "x" : "y";
      }
    }

    if (dragAxis.current === "y") {
      x.set(0);
    } else if (dragAxis.current === "x") {
      y.set(0);
    }
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    const axis = dragAxis.current;
    dragAxis.current = null;

    const { offset, velocity } = info;
    const horizontal = axis === "x" || (axis === null && Math.abs(offset.x) > Math.abs(offset.y));

    if (horizontal && offset.x > H_THRESHOLD) return flingOff("like");
    if (horizontal && offset.x < -H_THRESHOLD) return flingOff("pass");

    if (isMobile && !horizontal && offset.y < -V_THRESHOLD) return flingOff("skip");
    // Flick up with velocity even if distance is short
    if (isMobile && !horizontal && velocity.y < -650) return flingOff("skip");

    animate(x, 0, SNAP_SPRING);
    animate(y, 0, SNAP_SPRING);
  }

  return (
    <motion.div
      className="relative h-full w-full cursor-grab active:cursor-grabbing"
      style={{ x, y, rotateZ, touchAction: "none" }}
      drag={!reducedMotion && !exiting ? (isMobile ? true : "x") : false}
      dragSnapToOrigin={false}
      dragElastic={0.12}
      dragMomentum={false}
      dragDirectionLock
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      onTap={() => {
        if (Math.abs(x.get()) < 6 && Math.abs(y.get()) < 6) onOpenDetail();
      }}
      whileTap={{ scale: 0.985 }}
    >
      <BookCard
        book={book}
        coverUrl={coverUrl}
        saved={saved}
        onToggleSave={onToggleSave}
        layoutId={layoutId}
        showMeta
        priority
      />

      <motion.div
        style={{ opacity: likeOpacity }}
        className="pointer-events-none absolute left-6 top-10 -rotate-12 rounded-xl border-4 border-emerald-400 px-4 py-1 text-3xl font-extrabold uppercase tracking-wider text-emerald-400"
      >
        Love
      </motion.div>
      <motion.div
        style={{ opacity: passOpacity }}
        className="pointer-events-none absolute right-6 top-10 rotate-12 rounded-xl border-4 border-rose px-4 py-1 text-3xl font-extrabold uppercase tracking-wider text-rose"
      >
        Pass
      </motion.div>
    </motion.div>
  );
});
