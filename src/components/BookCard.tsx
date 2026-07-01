import { motion } from "framer-motion";
import { Heart, Sparkles } from "lucide-react";
import type { Book } from "../types";
import { CoverFallback } from "./CoverFallback";

interface BookCardProps {
  book: Book;
  coverUrl: string | null;
  saved: boolean;
  onToggleSave: () => void;
  /** Shared-element id for the tap-to-detail morph. */
  layoutId?: string;
  /** Show the "why recommended" chip + want-to-read badge (center card only). */
  showMeta?: boolean;
}

export function BookCard({
  book,
  coverUrl,
  saved,
  onToggleSave,
  layoutId,
  showMeta = true,
}: BookCardProps) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[1.4rem] bg-cream shadow-card">
      {/* Cover art or floral fallback */}
      {coverUrl ? (
        <motion.img
          layoutId={layoutId}
          src={coverUrl}
          alt={`Cover of ${book.title}`}
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <motion.div layoutId={layoutId} className="h-full w-full">
          <CoverFallback book={book} />
        </motion.div>
      )}

      {/* Gradient scrim so text + buttons stay legible over any cover */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/45" />

      {/* Save button — top right, stops propagation so it doesn't open detail */}
      <motion.button
        type="button"
        onPointerDownCapture={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSave();
        }}
        whileTap={{ scale: 0.8 }}
        className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full glass shadow-soft"
        aria-label={saved ? "Remove from saved" : "Save for later"}
      >
        <motion.span
          animate={saved ? { scale: [1, 1.35, 1] } : { scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <Heart
            className={saved ? "fill-rose text-rose" : "text-espresso/70"}
            size={20}
            strokeWidth={2.2}
          />
        </motion.span>
      </motion.button>

      {/* Want-to-read badge */}
      {showMeta && book.fromWantToRead && (
        <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full glass px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-espresso shadow-soft">
          <Sparkles size={12} className="text-gold" />
          Want to Read
        </div>
      )}

      {/* Title + author + reason at the bottom */}
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
