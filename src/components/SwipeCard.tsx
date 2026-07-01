import { useState } from "react";
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

interface SwipeCardProps {
  book: Book;
  coverUrl: string | null;
  saved: boolean;
  onToggleSave: () => void;
  onCommit: (action: SwipeAction) => void;
  onOpenDetail: () => void;
  layoutId: string;
  reducedMotion: boolean;
}

const H_THRESHOLD = 120;
const V_THRESHOLD = 100;

/**
 * The focused center card. Horizontal drag = like/pass (trains the algorithm),
 * downward drag = neutral skip. A tap (no meaningful drag) opens the detail
 * view. Browsing the carousel is handled by the parent, never by this drag.
 */
export function SwipeCard({
  book,
  coverUrl,
  saved,
  onToggleSave,
  onCommit,
  onOpenDetail,
  layoutId,
  reducedMotion,
}: SwipeCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [exiting, setExiting] = useState(false);

  const rotateZ = useTransform(x, [-300, 0, 300], [-15, 0, 15]);
  const likeOpacity = useTransform(x, [40, 140], [0, 1]);
  const passOpacity = useTransform(x, [-140, -40], [1, 0]);
  const skipOpacity = useTransform(y, [40, 120], [0, 1]);

  function flingOff(action: SwipeAction) {
    setExiting(true);
    const target =
      action === "like"
        ? { x: 600, y: 40 }
        : action === "pass"
          ? { x: -600, y: 40 }
          : { x: 0, y: 700 };
    animate(x, target.x, { type: "spring", stiffness: 180, damping: 22 });
    animate(y, target.y, {
      type: "spring",
      stiffness: 180,
      damping: 22,
      onComplete: () => onCommit(action),
    });
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    const { offset } = info;
    const horizontal = Math.abs(offset.x) > Math.abs(offset.y);

    if (horizontal && offset.x > H_THRESHOLD) return flingOff("like");
    if (horizontal && offset.x < -H_THRESHOLD) return flingOff("pass");
    if (!horizontal && offset.y > V_THRESHOLD) return flingOff("skip");

    // Under threshold: spring back to center.
    animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
    animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
  }

  return (
    <motion.div
      className="relative h-full w-full cursor-grab touch-none active:cursor-grabbing"
      style={{ x, y, rotateZ }}
      drag={!reducedMotion && !exiting}
      dragSnapToOrigin={false}
      dragElastic={0.6}
      onClick={() => {
        // Only treat as a tap if the card hasn't been dragged away.
        if (Math.abs(x.get()) < 6 && Math.abs(y.get()) < 6) onOpenDetail();
      }}
      onDragEnd={handleDragEnd}
      whileTap={{ scale: 0.99 }}
    >
      <BookCard
        book={book}
        coverUrl={coverUrl}
        saved={saved}
        onToggleSave={onToggleSave}
        layoutId={layoutId}
        showMeta
      />

      {/* Directional stamps */}
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
      <motion.div
        style={{ opacity: skipOpacity }}
        className="pointer-events-none absolute inset-x-0 bottom-16 mx-auto w-max rounded-xl border-4 border-white/70 px-4 py-1 text-2xl font-extrabold uppercase tracking-wider text-white/80"
      >
        Skip
      </motion.div>
    </motion.div>
  );
}
