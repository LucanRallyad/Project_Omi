import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, X, ChevronDown, BookOpen } from "lucide-react";
import type { Book } from "../types";
import { BookCard } from "./BookCard";
import { SwipeCard, type SwipeAction } from "./SwipeCard";
import { useViewport } from "../hooks/useViewport";

interface CoverflowCarouselProps {
  books: Book[];
  activeIndex: number;
  covers: Map<string, string | null>;
  savedKeys: Set<string>;
  onBrowse: (index: number) => void;
  onAction: (action: SwipeAction) => void;
  onToggleSave: (book: Book) => void;
  onOpenDetail: (book: Book) => void;
}

const VISIBLE_RANGE = 3;

const coverflowSpring = { type: "spring", stiffness: 260, damping: 28, mass: 0.8 } as const;

export function CoverflowCarousel({
  books,
  activeIndex,
  covers,
  savedKeys,
  onBrowse,
  onAction,
  onToggleSave,
  onOpenDetail,
}: CoverflowCarouselProps) {
  const reduced = useReducedMotion() ?? false;
  const { width, isMobile } = useViewport();
  const wheelLock = useRef(false);

  const cardW = isMobile
    ? Math.min(width * 0.82, 330)
    : Math.min(width * 0.32, 340);
  const cardH = cardW * 1.5;
  const spacing = isMobile ? cardW * 0.55 : cardW * 0.72;

  // Keyboard: arrows browse, up-arrow-free; shortcuts for actions.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowLeft":
          onBrowse(Math.max(0, activeIndex - 1));
          break;
        case "ArrowRight":
          onBrowse(Math.min(books.length - 1, activeIndex + 1));
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, books.length, onBrowse]);

  function handleWheel(e: React.WheelEvent) {
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) < 12 || wheelLock.current) return;
    wheelLock.current = true;
    setTimeout(() => (wheelLock.current = false), 260);
    if (delta > 0) onBrowse(Math.min(books.length - 1, activeIndex + 1));
    else onBrowse(Math.max(0, activeIndex - 1));
  }

  const activeBook = books[activeIndex];

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center">
      <div
        className="relative flex w-full flex-1 items-center justify-center"
        style={{ perspective: 1200 }}
        onWheel={handleWheel}
      >
        <div
          className="relative"
          style={{ width: cardW, height: cardH, transformStyle: "preserve-3d" }}
        >
          {books.map((book, index) => {
            const d = index - activeIndex;
            if (Math.abs(d) > VISIBLE_RANGE) return null;

            const isCenter = d === 0;

            // Desktop coverflow fan vs mobile stacked deck.
            const target = isMobile
              ? {
                  x: 0,
                  y: -Math.abs(d) * 14,
                  rotateY: 0,
                  scale: 1 - Math.abs(d) * 0.06,
                  opacity: d < 0 ? 0 : 1 - Math.abs(d) * 0.2,
                }
              : {
                  x: d * spacing,
                  y: 0,
                  rotateY: reduced ? 0 : d * -28,
                  scale: 1 - Math.abs(d) * 0.12,
                  opacity: 1 - Math.abs(d) * 0.32,
                };

            const zIndex = 100 - Math.abs(d);
            const layoutId = `cover-${book.key}`;

            return (
              <motion.div
                key={book.key}
                className="absolute inset-0"
                style={{ zIndex }}
                initial={false}
                animate={{
                  x: target.x,
                  y: target.y,
                  rotateY: target.rotateY,
                  scale: target.scale,
                  opacity: target.opacity,
                  filter: isCenter ? "blur(0px)" : "blur(1.5px) brightness(0.9)",
                }}
                transition={coverflowSpring}
              >
                {isCenter ? (
                  <SwipeCard
                    book={book}
                    coverUrl={covers.get(book.key) ?? null}
                    saved={savedKeys.has(book.key)}
                    onToggleSave={() => onToggleSave(book)}
                    onCommit={onAction}
                    onOpenDetail={() => onOpenDetail(book)}
                    layoutId={layoutId}
                    reducedMotion={reduced}
                  />
                ) : (
                  <button
                    type="button"
                    className="h-full w-full"
                    onClick={() => onBrowse(index)}
                    tabIndex={-1}
                    aria-label={`Browse to ${book.title}`}
                  >
                    <BookCard
                      book={book}
                      coverUrl={covers.get(book.key) ?? null}
                      saved={savedKeys.has(book.key)}
                      onToggleSave={() => onToggleSave(book)}
                      layoutId={layoutId}
                      showMeta={false}
                    />
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Action buttons: Pass / Skip / Like + open detail */}
      {activeBook && (
        <div className="flex items-center gap-5 py-6">
          <ActionButton label="Pass" onClick={() => onAction("pass")} tone="pass">
            <X size={26} strokeWidth={2.6} />
          </ActionButton>
          <ActionButton label="Skip" onClick={() => onAction("skip")} tone="skip" small>
            <ChevronDown size={22} strokeWidth={2.6} />
          </ActionButton>
          <ActionButton label="Details" onClick={() => onOpenDetail(activeBook)} tone="detail" small>
            <BookOpen size={22} strokeWidth={2.4} />
          </ActionButton>
          <ActionButton label="Love" onClick={() => onAction("like")} tone="like">
            <Check size={26} strokeWidth={2.6} />
          </ActionButton>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  children,
  label,
  onClick,
  tone,
  small,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  tone: "like" | "pass" | "skip" | "detail";
  small?: boolean;
}) {
  const tones: Record<string, string> = {
    like: "bg-emerald-500 text-white shadow-[0_10px_25px_-8px_rgba(16,185,129,0.7)]",
    pass: "bg-rose text-white shadow-[0_10px_25px_-8px_rgba(212,132,154,0.7)]",
    skip: "glass text-espresso/70",
    detail: "glass text-espresso/70",
  };
  const size = small ? "h-12 w-12" : "h-16 w-16";
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.85 }}
      whileHover={{ scale: 1.08 }}
      className={`flex ${size} items-center justify-center rounded-full ${tones[tone]}`}
      aria-label={label}
    >
      {children}
    </motion.button>
  );
}
