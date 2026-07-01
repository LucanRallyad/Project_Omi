import { motion } from "framer-motion";
import { Heart, Sparkles } from "lucide-react";
import type { Book } from "../types";
import { BookCover } from "./BookCover";

interface BookCardProps {
  book: Book;
  coverUrl: string | null;
  saved: boolean;
  onToggleSave: () => void;
  /** Shared-element id for the tap-to-detail morph. */
  layoutId?: string;
  /** Show the "why recommended" chip + want-to-read badge (center card only). */
  showMeta?: boolean;
  /** Dark immersive mode (mobile discover). */
  dark?: boolean;
  /** Eager-load cover (center card). */
  priority?: boolean;
  /** Drop shadow — off on mobile to avoid clip seams above the action bar. */
  elevated?: boolean;
}

export function BookCard({
  book,
  coverUrl,
  saved,
  onToggleSave,
  layoutId,
  showMeta = true,
  dark = false,
  priority = false,
  elevated = true,
}: BookCardProps) {
  const displayUrl = coverUrl ?? book.seedCoverUrl ?? null;
  const shadow = elevated
    ? dark
      ? "shadow-[0_24px_60px_-16px_rgba(0,0,0,0.65)]"
      : "shadow-card"
    : "shadow-none";

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-[1.4rem] ${
        dark ? `bg-charcoal ${shadow}` : `bg-cream ${shadow}`
      }`}
    >
      <BookCover
        book={book}
        coverUrl={displayUrl}
        layoutId={layoutId}
        priority={priority}
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/45" />

      <motion.button
        type="button"
        onPointerDownCapture={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSave();
        }}
        whileTap={{ scale: 0.8 }}
        className={`absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full shadow-soft ${
          dark ? "glass-dark" : "glass"
        }`}
        aria-label={saved ? "Remove from saved" : "Save for later"}
      >
        <motion.span
          animate={saved ? { scale: [1, 1.35, 1] } : { scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <Heart
            className={saved ? "fill-rose text-rose" : dark ? "text-white/70" : "text-espresso/70"}
            size={20}
            strokeWidth={2.2}
          />
        </motion.span>
      </motion.button>

      {showMeta && book.fromWantToRead && (
        <div
          className={`absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide shadow-soft ${
            dark ? "glass-dark text-white/90" : "glass text-espresso"
          }`}
        >
          <Sparkles size={12} className="text-gold" />
          Want to Read
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 z-10 p-4 text-white">
        <h3 className="font-display text-2xl font-semibold leading-tight drop-shadow-md">
          {book.title}
        </h3>
        <p className="mt-0.5 text-sm text-white/85 drop-shadow">{book.author}</p>
        {showMeta && book.reason && (
          <p className="mt-2 inline-block rounded-full bg-white/20 px-3 py-1 text-xs text-white/95 backdrop-blur-sm">
            {book.reason}
          </p>
        )}
      </div>
    </div>
  );
}
