import { useViewport } from "../hooks/useViewport";

/** Shimmer placeholder cards laid out like the coverflow so nothing jumps. */
export function CarouselSkeleton() {
  const { width, isMobile } = useViewport();
  const cardW = isMobile ? Math.min(width * 0.82, 330) : Math.min(width * 0.32, 340);
  const cardH = cardW * 1.5;
  const spacing = isMobile ? cardW * 0.55 : cardW * 0.72;
  const offsets = isMobile ? [0] : [-1, 0, 1];

  return (
    <div className="flex h-full w-full items-center justify-center" style={{ perspective: 1200 }}>
      <div className="relative" style={{ width: cardW, height: cardH }}>
        {offsets.map((d) => (
          <div
            key={d}
            className="absolute inset-0 rounded-[1.4rem] shimmer-bg animate-shimmer shadow-card"
            style={{
              transform: `translateX(${d * spacing}px) rotateY(${d * -28}deg) scale(${
                1 - Math.abs(d) * 0.12
              })`,
              opacity: 1 - Math.abs(d) * 0.32,
              zIndex: 100 - Math.abs(d),
            }}
          />
        ))}
      </div>
    </div>
  );
}
