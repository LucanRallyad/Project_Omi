import { useViewport } from "../hooks/useViewport";
import { cardDimensions, computeCardTransform } from "../lib/carouselLayout";

/** Shimmer placeholder cards laid out like the coverflow so nothing jumps. */
export function CarouselSkeleton() {
  const { width, height, isMobile } = useViewport();
  const { cardW, cardH, spacing } = cardDimensions(width, height, isMobile);
  const offsets = isMobile ? [0, 1, 2] : [-2, -1, 0, 1, 2];

  const stageClass = isMobile
    ? "items-center justify-center overflow-x-hidden pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] pb-4"
    : "items-center justify-center overflow-hidden";

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={`relative flex min-h-0 w-full flex-1 px-4 ${stageClass}`}
        style={{ perspective: isMobile ? undefined : 1400, perspectiveOrigin: "50% 45%" }}
      >
        <div
          className="relative"
          style={{ width: cardW, height: cardH, transformStyle: isMobile ? undefined : "preserve-3d" }}
        >
          {offsets.map((d) => {
            const t = computeCardTransform(d, {
              isMobile,
              spacing,
              reduced: false,
              isCenter: d === 0,
            });
            return (
              <div
                key={d}
                className={`absolute inset-0 rounded-[1.4rem] shimmer-bg animate-shimmer ${
                  isMobile ? "" : "shadow-card"
                }`}
                style={{
                  transform: `translateX(${t.x}px) translateY(${t.y}px) translateZ(${t.z}px) rotateY(${t.rotateY}deg) rotateZ(${t.rotateZ}deg) scale(${t.scale})`,
                  opacity: t.opacity,
                  zIndex: 100 - Math.abs(d),
                }}
              />
            );
          })}
        </div>
      </div>
      {isMobile && (
        <div
          className="shrink-0 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          aria-hidden
        >
          <div className="flex items-center justify-center gap-4">
            <div className="h-14 w-14 rounded-full shimmer-bg animate-shimmer opacity-40" />
            <div className="h-12 w-12 rounded-full shimmer-bg animate-shimmer opacity-30" />
            <div className="h-12 w-12 rounded-full shimmer-bg animate-shimmer opacity-30" />
            <div className="h-14 w-14 rounded-full shimmer-bg animate-shimmer opacity-40" />
          </div>
        </div>
      )}
    </div>
  );
}
