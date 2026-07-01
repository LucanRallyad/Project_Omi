import { motion } from "framer-motion";
import { X, Check, ChevronDown, Heart, ExternalLink, ShoppingBag } from "lucide-react";
import type { Book } from "../types";
import { useBookMeta } from "../hooks/useBookMeta";
import { buyLinks } from "../lib/bookApi";
import { CoverFallback } from "./CoverFallback";
import type { SwipeAction } from "./SwipeCard";

interface BookDetailProps {
  book: Book;
  saved: boolean;
  onToggleSave: () => void;
  onAction: (action: SwipeAction) => void;
  onClose: () => void;
  /** Only the active discover card can be rated; shelf books are read-only. */
  showActions: boolean;
}

export function BookDetail({
  book,
  saved,
  onToggleSave,
  onAction,
  onClose,
  showActions,
}: BookDetailProps) {
  const { meta, loading } = useBookMeta(book);
  const links = buyLinks(book);
  const layoutId = `cover-${book.key}`;

  function act(action: SwipeAction) {
    onAction(action);
    onClose();
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-stretch justify-center"
      initial={{ backdropFilter: "blur(0px)" }}
      animate={{ backdropFilter: "blur(10px)" }}
      exit={{ backdropFilter: "blur(0px)" }}
    >
      {/* Dimmed backdrop */}
      <motion.div
        className="absolute inset-0 bg-espresso/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Content sheet */}
      <motion.div
        className="relative z-10 flex h-full w-full max-w-2xl flex-col overflow-y-auto no-scrollbar bg-cream/95 shadow-card md:my-6 md:h-auto md:max-h-[92vh] md:rounded-3xl"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.3}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120) onClose();
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full glass shadow-soft"
          aria-label="Close"
        >
          <X size={20} className="text-espresso" />
        </button>

        {/* Cover header */}
        <div className="relative h-72 w-full shrink-0 overflow-hidden md:h-80 md:rounded-t-3xl">
          {meta.coverUrl ? (
            <motion.img
              layoutId={layoutId}
              src={meta.coverUrl}
              alt={`Cover of ${book.title}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <motion.div layoutId={layoutId} className="h-full w-full">
              <CoverFallback book={book} />
            </motion.div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-cream via-cream/40 to-transparent" />

          <button
            type="button"
            onClick={onToggleSave}
            className="absolute bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full glass shadow-soft"
            aria-label={saved ? "Remove from saved" : "Save for later"}
          >
            <Heart className={saved ? "fill-rose text-rose" : "text-espresso/70"} size={22} />
          </button>
        </div>

        {/* Body */}
        <div className={`flex flex-1 flex-col gap-4 px-6 pt-4 ${showActions ? "pb-28" : "pb-10"}`}>
          <div>
            <h2 className="font-display text-3xl font-semibold leading-tight text-espresso">
              {book.title}
            </h2>
            <p className="mt-1 text-espresso/70">{book.author}</p>
            {book.series && (
              <p className="mt-1 text-sm italic text-espresso/60">
                {book.series}
                {book.seriesNumber ? ` · Book ${book.seriesNumber}` : ""}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            {book.averageRating && (
              <span className="rounded-full bg-gold/20 px-3 py-1 text-espresso">
                ★ {book.averageRating.toFixed(2)} avg
              </span>
            )}
            {meta.pageCount && (
              <span className="rounded-full bg-blush/40 px-3 py-1 text-espresso">
                {meta.pageCount} pages
              </span>
            )}
            {meta.price && (
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-800">
                {meta.price}
              </span>
            )}
            {book.reason && (
              <span className="rounded-full bg-rose/15 px-3 py-1 text-rose">{book.reason}</span>
            )}
          </div>

          <div className="min-h-[3rem]">
            {loading ? (
              <div className="space-y-2">
                <div className="h-3 w-full rounded shimmer-bg animate-shimmer" />
                <div className="h-3 w-11/12 rounded shimmer-bg animate-shimmer" />
                <div className="h-3 w-4/5 rounded shimmer-bg animate-shimmer" />
              </div>
            ) : (
              <p className="text-[15px] leading-relaxed text-espresso/85">
                {meta.description ??
                  "We couldn't find a description for this one — but if it matches your taste, it's worth a look."}
              </p>
            )}
          </div>

          {/* Buy links */}
          <div className="mt-2 grid grid-cols-2 gap-3">
            <a
              href={links.bookshop}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-2xl bg-rose px-4 py-3 font-semibold text-white shadow-soft transition-transform active:scale-95"
            >
              <ShoppingBag size={18} /> Bookshop
            </a>
            <a
              href={links.amazon}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-2xl bg-espresso px-4 py-3 font-semibold text-white shadow-soft transition-transform active:scale-95"
            >
              <ShoppingBag size={18} /> Amazon
            </a>
          </div>
          {book.goodreadsUrl && (
            <a
              href={book.goodreadsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 text-sm text-espresso/60 underline-offset-2 hover:underline"
            >
              View on Goodreads <ExternalLink size={13} />
            </a>
          )}
        </div>

        {/* Sticky action bar (only for the active discover card) */}
        {showActions && (
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-4 border-t border-espresso/10 bg-cream/90 px-6 py-4 backdrop-blur-md">
            <DetailAction label="Pass" tone="pass" onClick={() => act("pass")}>
              <X size={22} strokeWidth={2.6} />
            </DetailAction>
            <DetailAction label="Skip" tone="skip" onClick={() => act("skip")}>
              <ChevronDown size={20} strokeWidth={2.6} />
            </DetailAction>
            <DetailAction label="Love" tone="like" onClick={() => act("like")}>
              <Check size={22} strokeWidth={2.6} />
            </DetailAction>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function DetailAction({
  children,
  label,
  tone,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  tone: "like" | "pass" | "skip";
  onClick: () => void;
}) {
  const tones: Record<string, string> = {
    like: "bg-emerald-500 text-white",
    pass: "bg-rose text-white",
    skip: "glass text-espresso/70",
  };
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.85 }}
      className={`flex h-14 w-14 items-center justify-center rounded-full ${tones[tone]} shadow-soft`}
      aria-label={label}
    >
      {children}
    </motion.button>
  );
}
