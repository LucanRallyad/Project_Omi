import { motion, useDragControls } from "framer-motion";
import { X, Check, ChevronUp, Heart, ExternalLink, ShoppingBag } from "lucide-react";
import type { Book, BookMeta } from "../types";
import { useBookMeta } from "../hooks/useBookMeta";
import { useViewport } from "../hooks/useViewport";
import { buyLinks } from "../lib/bookApi";
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

  function act(action: SwipeAction) {
    onAction(action);
    onClose();
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-stretch justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className={`absolute inset-0 ${isMobile ? "bg-espresso/55" : "bg-espresso/50 backdrop-blur-sm"}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

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
        <DetailHeader
          saved={saved}
          onClose={onClose}
          onToggleSave={onToggleSave}
          isMobile={isMobile}
          onDragStart={isMobile ? (e) => dragControls.start(e) : undefined}
        />

        <div
          className={`min-h-0 flex-1 overflow-y-auto overscroll-y-contain no-scrollbar touch-pan-y pb-4 ${
            isMobile ? "px-4" : "px-6 pb-6"
          }`}
        >
          <div className="rounded-2xl border border-espresso/15 bg-white/50 p-5 shadow-soft md:p-6">
            <BookInfo book={book} meta={meta} loading={loading} />
          </div>

          <BuyLinks links={links} goodreadsUrl={book.goodreadsUrl} className="mt-4" />
        </div>

        {showActions && (
          <div
            className={`shrink-0 flex items-center justify-center gap-4 border-t border-espresso/10 bg-cream/90 px-6 py-4 backdrop-blur-md ${
              isMobile ? "pb-[max(1rem,env(safe-area-inset-bottom))]" : "md:rounded-b-3xl"
            }`}
          >
            <DetailAction label="Pass" tone="pass" onClick={() => act("pass")}>
              <X size={22} strokeWidth={2.6} />
            </DetailAction>
            {isMobile && (
              <DetailAction label="Skip" tone="skip" onClick={() => act("skip")}>
                <ChevronUp size={20} strokeWidth={2.6} />
              </DetailAction>
            )}
            <DetailAction label="Love" tone="like" onClick={() => act("like")}>
              <Check size={22} strokeWidth={2.6} />
            </DetailAction>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function DetailHeader({
  saved,
  onClose,
  onToggleSave,
  isMobile,
  onDragStart,
}: {
  saved: boolean;
  onClose: () => void;
  onToggleSave: () => void;
  isMobile: boolean;
  onDragStart?: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      className={`shrink-0 border-b border-espresso/10 bg-cream/95 ${
        isMobile
          ? "px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
          : "rounded-t-3xl px-6 pb-4 pt-5"
      }`}
    >
      {isMobile && onDragStart && (
        <div
          className="flex cursor-grab justify-center py-1 active:cursor-grabbing"
          onPointerDown={onDragStart}
          aria-hidden
        >
          <div className="h-1 w-10 rounded-full bg-espresso/20" />
        </div>
      )}

      <div className={isMobile ? "mt-2 flex items-center justify-between" : "flex items-center justify-between"}>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-full glass shadow-soft"
          aria-label="Close"
        >
          <X size={20} className="text-espresso" />
        </button>

        <p className="text-sm font-medium text-espresso/55">Book details</p>

        <button
          type="button"
          onClick={onToggleSave}
          className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-full glass shadow-soft"
          aria-label={saved ? "Remove from saved" : "Save for later"}
        >
          <Heart className={saved ? "fill-rose text-rose" : "text-espresso/70"} size={20} />
        </button>
      </div>
    </div>
  );
}

function BookInfo({
  book,
  meta,
  loading,
}: {
  book: Book;
  meta: BookMeta;
  loading: boolean;
}) {
  return (
    <>
      <div>
        <h2 className="font-display text-3xl font-semibold leading-tight text-espresso md:text-4xl">
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

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
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

      <div className="mt-4 min-h-[3rem]">
        {loading && !meta.description ? (
          <div className="space-y-2">
            <div className="h-3 w-full rounded shimmer-bg animate-shimmer" />
            <div className="h-3 w-11/12 rounded shimmer-bg animate-shimmer" />
            <div className="h-3 w-4/5 rounded shimmer-bg animate-shimmer" />
          </div>
        ) : (
          <p className="text-[15px] leading-relaxed text-espresso/85 md:text-base">
            {meta.description ??
              "We couldn't find a description for this one — but if it matches your taste, it's worth a look."}
          </p>
        )}
      </div>
    </>
  );
}

function BuyLinks({
  links,
  goodreadsUrl,
  className = "",
}: {
  links: ReturnType<typeof buyLinks>;
  goodreadsUrl: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-3">
        <a
          href={links.indigo}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-2xl bg-rose px-4 py-3 font-semibold text-white shadow-soft transition-transform active:scale-95"
        >
          <ShoppingBag size={18} /> Indigo
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
      {goodreadsUrl && (
        <a
          href={goodreadsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex items-center justify-center gap-1.5 text-sm text-espresso/60 underline-offset-2 hover:underline"
        >
          View on Goodreads <ExternalLink size={13} />
        </a>
      )}
    </div>
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
      onPointerDown={(e) => e.stopPropagation()}
      whileTap={{ scale: 0.85 }}
      className={`relative z-10 flex h-14 w-14 touch-manipulation items-center justify-center rounded-full ${tones[tone]} shadow-soft`}
      aria-label={label}
    >
      {children}
    </motion.button>
  );
}
