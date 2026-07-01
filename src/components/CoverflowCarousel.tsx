import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, X, ChevronUp, BookOpen } from "lucide-react";
import type { Book } from "../types";
import { BookCard } from "./BookCard";
import { SwipeCard, type SwipeAction, type SwipeCardHandle } from "./SwipeCard";
import { useViewport } from "../hooks/useViewport";
import {
  cardDimensions,
  computeCardTransform,
  DESKTOP_SPRING,
  MOBILE_TWEEN,
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

const DESKTOP_VISIBLE_RANGE = 4;
const MOBILE_VISIBLE_RANGE = 3;

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
  const swipeRef = useRef<SwipeCardHandle>(null);

  const { cardW, cardH, spacing } = cardDimensions(width, height, isMobile);
  const transition = isMobile ? MOBILE_TWEEN : DESKTOP_SPRING;
  const visibleRange = isMobile ? MOBILE_VISIBLE_RANGE : DESKTOP_VISIBLE_RANGE;

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
        className={`relative z-10 flex min-h-0 w-full flex-1 justify-center px-4 ${
          isMobile
            ? "items-center overflow-x-hidden overflow-y-visible pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] pb-4"
            : "items-center overflow-hidden"
        }`}
        style={{ perspective: isMobile ? undefined : 1400, perspectiveOrigin: "50% 45%" }}
        onWheel={handleWheel}
      >
        <div
          className="relative"
          style={{ width: cardW, height: cardH, transformStyle: isMobile ? undefined : "preserve-3d" }}
        >
          {books.map((book, index) => {
            const d = index - activeIndex;
            if (Math.abs(d) > visibleRange) return null;
            if (isMobile && d < 0) return null;

            const isCenter = d === 0;
            const target = computeCardTransform(d, {
              isMobile,
              spacing,
              reduced,
              isCenter,
            });

            const zIndex = 100 - Math.abs(d);

            return (
              <motion.div
                key={book.key}
                className="absolute inset-0"
                style={{
                  zIndex,
                  transformStyle: isMobile ? undefined : "preserve-3d",
                  willChange: "transform, opacity",
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
                }}
                transition={transition}
              >
                {isCenter ? (
                  <SwipeCard
                    ref={swipeRef}
                    book={book}
                    coverUrl={covers.get(book.key) ?? book.seedCoverUrl ?? null}
                    saved={savedKeys.has(book.key)}
                    onToggleSave={() => onToggleSave(book)}
                    onCommit={onAction}
                    onOpenDetail={() => onOpenDetail(book)}
                    reducedMotion={reduced}
                    isMobile={isMobile}
                    cardHeight={cardH}
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
                      showMeta={false}
                      elevated={!isMobile}
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
          className={`relative z-40 flex shrink-0 items-center justify-center px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${
            isMobile ? "gap-4" : "gap-5 py-6"
          }`}
        >
          <ActionButton label="Pass" onClick={() => swipeRef.current?.trigger("pass")} tone="pass">
            <X size={isMobile ? 24 : 26} strokeWidth={2.6} />
          </ActionButton>
          {isMobile ? (
            <ActionButton
              label="Skip"
              onClick={() => swipeRef.current?.trigger("skip")}
              tone="skip"
              small
            >
              <ChevronUp size={22} strokeWidth={2.6} />
            </ActionButton>
          ) : (
            <ActionButton
              label="Next book"
              onClick={() => onBrowse(Math.min(books.length - 1, activeIndex + 1))}
              tone="skip"
              small
            >
              <ChevronUp size={22} strokeWidth={2.6} className="rotate-90" />
            </ActionButton>
          )}
          <ActionButton
            label="Details"
            onClick={() => onOpenDetail(activeBook)}
            tone="detail"
            small
          >
            <BookOpen size={22} strokeWidth={2.4} />
          </ActionButton>
          <ActionButton label="Love" onClick={() => swipeRef.current?.trigger("like")} tone="like">
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
