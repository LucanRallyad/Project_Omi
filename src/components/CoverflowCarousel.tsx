import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, X, ChevronDown, BookOpen } from "lucide-react";
import type { Book } from "../types";
import { BookCard } from "./BookCard";
import { SwipeCard, type SwipeAction } from "./SwipeCard";
import { useViewport } from "../hooks/useViewport";
import {
  cardDimensions,
  computeCardTransform,
  DESKTOP_SPRING,
  MOBILE_SPRING,
} from "../lib/carouselLayout";

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

const VISIBLE_RANGE = 4;

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
  const { width, height, isMobile } = useViewport();
  const wheelLock = useRef(false);

  const { cardW, cardH, spacing } = cardDimensions(width, height, isMobile);
  const spring = isMobile ? MOBILE_SPRING : DESKTOP_SPRING;

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
    setTimeout(() => (wheelLock.current = false), 280);
    if (delta > 0) onBrowse(Math.min(books.length - 1, activeIndex + 1));
    else onBrowse(Math.max(0, activeIndex - 1));
  }

  const activeBook = books[activeIndex];

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <div
        className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
        style={{ perspective: isMobile ? 900 : 1400, perspectiveOrigin: "50% 45%" }}
        onWheel={handleWheel}
      >
        <div
          className="relative"
          style={{ width: cardW, height: cardH, transformStyle: "preserve-3d" }}
        >
          {books.map((book, index) => {
            const d = index - activeIndex;
            if (Math.abs(d) > VISIBLE_RANGE) return null;
            if (isMobile && d < 0) return null;

            const isCenter = d === 0;
            const target = computeCardTransform(d, {
              isMobile,
              spacing,
              reduced,
              isCenter,
            });

            const zIndex = 100 - Math.abs(d);
            const layoutId = `cover-${book.key}`;

            return (
              <motion.div
                key={book.key}
                className="absolute inset-0"
                style={{
                  zIndex,
                  transformStyle: "preserve-3d",
                  transformPerspective: isMobile ? 900 : 1400,
                }}
                initial={false}
                animate={{
                  x: target.x,
                  y: target.y,
                  rotateY: target.rotateY,
                  rotateZ: target.rotateZ,
                  scale: target.scale,
                  opacity: target.opacity,
                  z: target.z,
                  filter: target.filter,
                }}
                transition={spring}
              >
                {isCenter ? (
                  <SwipeCard
                    book={book}
                    coverUrl={covers.get(book.key) ?? book.seedCoverUrl ?? null}
                    saved={savedKeys.has(book.key)}
                    onToggleSave={() => onToggleSave(book)}
                    onCommit={onAction}
                    onOpenDetail={() => onOpenDetail(book)}
                    layoutId={layoutId}
                    reducedMotion={reduced}
                    isMobile={isMobile}
                  />
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    className="h-full w-full cursor-pointer"
                    onClick={() => onBrowse(index)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onBrowse(index);
                      }
                    }}
                    aria-label={`Browse to ${book.title}`}
                  >
                    <BookCard
                      book={book}
                      coverUrl={covers.get(book.key) ?? book.seedCoverUrl ?? null}
                      saved={savedKeys.has(book.key)}
                      onToggleSave={() => onToggleSave(book)}
                      layoutId={layoutId}
                      showMeta={false}
                      dark={isMobile}
                    />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {activeBook && (
        <div
          className={`relative z-30 flex shrink-0 items-center justify-center px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${
            isMobile ? "gap-4" : "gap-5 py-6"
          }`}
        >
          <ActionButton label="Pass" onClick={() => onAction("pass")} tone="pass" dark={isMobile}>
            <X size={isMobile ? 24 : 26} strokeWidth={2.6} />
          </ActionButton>
          <ActionButton
            label="Skip"
            onClick={() => onAction("skip")}
            tone="skip"
            dark={isMobile}
            small
          >
            <ChevronDown size={22} strokeWidth={2.6} />
          </ActionButton>
          <ActionButton
            label="Details"
            onClick={() => onOpenDetail(activeBook)}
            tone="detail"
            dark={isMobile}
            small
          >
            <BookOpen size={22} strokeWidth={2.4} />
          </ActionButton>
          <ActionButton label="Love" onClick={() => onAction("like")} tone="like" dark={isMobile}>
            <Check size={isMobile ? 24 : 26} strokeWidth={2.6} />
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
  dark,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  tone: "like" | "pass" | "skip" | "detail";
  small?: boolean;
  dark?: boolean;
}) {
  const tones: Record<string, string> = {
    like: "bg-emerald-500 text-white shadow-[0_10px_25px_-8px_rgba(16,185,129,0.7)]",
    pass: "bg-rose text-white shadow-[0_10px_25px_-8px_rgba(212,132,154,0.7)]",
    skip: dark ? "glass-dark text-white/80" : "glass text-espresso/70",
    detail: dark ? "glass-dark text-white/80" : "glass text-espresso/70",
  };
  const size = small ? "h-12 w-12" : dark ? "h-14 w-14" : "h-16 w-16";
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      whileTap={{ scale: 0.85 }}
      whileHover={{ scale: 1.08 }}
      className={`relative z-10 flex ${size} touch-manipulation items-center justify-center rounded-full ${tones[tone]}`}
      aria-label={label}
    >
      {children}
    </motion.button>
  );
}
