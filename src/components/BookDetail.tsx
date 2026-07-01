import { motion, useDragControls } from "framer-motion";
import { X, Check, ChevronDown, Heart, ExternalLink, ShoppingBag } from "lucide-react";
import type { Book } from "../types";
import { useBookMeta } from "../hooks/useBookMeta";
import { useViewport } from "../hooks/useViewport";
import { buyLinks } from "../lib/bookApi";
import { BookCover } from "./BookCover";
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
  const { isMobile } = useViewport();
  const dragControls = useDragControls();
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
        className={`relative z-10 flex h-full w-full max-w-2xl flex-col overflow-hidden bg-cream/95 shadow-card ${
          isMobile ? "" : "md:my-6 md:max-h-[92vh] md:rounded-3xl"
        }`}
        initial={{ y: isMobile ? "100%" : 40, opacity: isMobile ? 1 : 0, scale: isMobile ? 1 : 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: isMobile ? "100%" : 40, opacity: isMobile ? 1 : 0, scale: isMobile ? 1 : 0.98 }}
        transition={{ type: "spring", stiffness: isMobile ? 320 : 300, damping: isMobile ? 34 : 32 }}
        drag={isMobile ? "y" : false}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.3}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120) onClose();
        }}
      >
        {isMobile && (
          <div
            className="flex shrink-0 cursor-grab justify-center py-3 active:cursor-grabbing"
            onPointerDown={(e) => dragControls.start(e)}
            aria-hidden
          >
            <div className="h-1 w-10 rounded-full bg-espresso/20" />
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className={`absolute right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full glass shadow-soft ${
            isMobile ? "top-12" : "top-4"
          }`}
          aria-label="Close"
        >
          <X size={20} className="text-espresso" />
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain no-scrollbar touch-pan-y">
        {/* Cover header */}
        <div className={`relative h-72 w-full shrink-0 overflow-hidden md:h-80 ${isMobile ? "" : "md:rounded-t-3xl"}`}>
          <BookCover
            book={book}
            coverUrl={meta.coverUrl ?? book.seedCoverUrl ?? null}
            layoutId={layoutId}
            priority
          />
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
        <div className="flex flex-col gap-4 px-6 pt-4 pb-8">
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
        </div>

        {/* Action bar sits below scroll content so it never covers the description */}
        {showActions && (
          <div className="shrink-0 flex items-center justify-center gap-4 border-t border-espresso/10 bg-cream/90 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md">
            <DetailAction label="Pass" tone="pass" dark={isMobile} onClick={() => act("pass")}>
              <X size={22} strokeWidth={2.6} />
            </DetailAction>
            <DetailAction label="Skip" tone="skip" dark={isMobile} onClick={() => act("skip")}>
              <ChevronDown size={20} strokeWidth={2.6} />
            </DetailAction>
            <DetailAction label="Love" tone="like" dark={isMobile} onClick={() => act("like")}>
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
  dark,
}: {
  children: React.ReactNode;
  label: string;
  tone: "like" | "pass" | "skip";
  onClick: () => void;
  dark?: boolean;
}) {
  const tones: Record<string, string> = {
    like: "bg-emerald-500 text-white",
    pass: "bg-rose text-white",
    skip: dark ? "glass-dark text-white/80" : "glass text-espresso/70",
  };
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      whileTap={{ scale: 0.85 }}
      className={`relative z-10 flex h-14 w-14 touch-manipulation items-center justify-center rounded-full ${tones[tone]} shadow-soft`}
      aria-label={label}
    >
      {children}
    </motion.button>
  );
}
