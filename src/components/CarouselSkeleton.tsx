import { useViewport } from "../hooks/useViewport";
import { cardDimensions, computeCardTransform } from "../lib/carouselLayout";

/** Shimmer placeholder cards laid out like the coverflow so nothing jumps. */
export function CarouselSkeleton() {
  const { width, height, isMobile } = useViewport();
  const { cardW, cardH, spacing } = cardDimensions(width, height, isMobile);
  const offsets = isMobile ? [0, 1, 2] : [-2, -1, 0, 1, 2];

  return (
    <div
      className="flex h-full min-h-0 w-full items-center justify-center px-4 pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))]"
      style={{ perspective: isMobile ? 900 : 1400, perspectiveOrigin: "50% 45%" }}
    >
      <div className="relative" style={{ width: cardW, height: cardH, transformStyle: "preserve-3d" }}>
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
                isMobile ? "shadow-[0_24px_60px_-16px_rgba(0,0,0,0.5)]" : "shadow-card"
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
  );
}
