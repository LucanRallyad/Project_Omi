/** Shared layout math for the coverflow carousel — tuned to the reference video. */

export const DESKTOP_SPRING = {
  type: "spring" as const,
  stiffness: 190,
  damping: 26,
  mass: 0.95,
};

export const MOBILE_SPRING = {
  type: "spring" as const,
  stiffness: 240,
  damping: 30,
  mass: 0.75,
};

/** Cheaper than springs on mobile — avoids layout thrash during browse. */
export const MOBILE_TWEEN = {
  type: "tween" as const,
  duration: 0.26,
  ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
};

export interface CardTransform {
  x: number;
  y: number;
  rotateY: number;
  rotateZ: number;
  scale: number;
  opacity: number;
  z: number;
}

/** Reserve space for the floating nav + action bar on mobile discover. */
export const MOBILE_CHROME = {
  top: 48,
  bottom: 88,
};

export function cardDimensions(width: number, height: number, isMobile: boolean) {
  if (isMobile) {
    const availH = Math.max(280, height - MOBILE_CHROME.top - MOBILE_CHROME.bottom);
    const fromWidth = Math.min(width * 0.86, 320);
    const fromHeight = availH / 1.48;
    const cardW = Math.max(220, Math.min(fromWidth, fromHeight));
    const cardH = cardW * 1.48;
    return { cardW, cardH, spacing: 0 };
  }

  const cardW = Math.min(width * 0.32, 340);
  const cardH = cardW * 1.5;
  const spacing = cardW * 0.78;
  return { cardW, cardH, spacing };
}

export function computeCardTransform(
  d: number,
  opts: { isMobile: boolean; spacing: number; reduced: boolean; isCenter: boolean }
): CardTransform {
  const { isMobile, spacing, reduced, isCenter } = opts;
  const ad = Math.abs(d);

  if (isMobile) {
    // Stacked deck: cards fan behind the center with alternating tilt (reference ~12–16s).
    if (d < 0) {
      return {
        x: -48,
        y: 28,
        rotateY: 0,
        rotateZ: -16,
        scale: 0.86,
        opacity: 0,
        z: -120,
      };
    }

    const sign = d % 2 === 1 ? 1 : -1;
    return {
      x: sign * (12 + d * 10),
      y: -d * 34,
      rotateY: 0,
      rotateZ: sign * (5 + d * 4),
      scale: 1 - d * 0.085,
      opacity: isCenter ? 1 : Math.max(0.55, 1 - d * 0.18),
      z: -d * 55,
    };
  }

  // Desktop coverflow: wide fan, deep rotateY, cards slide behind center (reference ~0–8s).
  return {
    x: d * spacing,
    y: ad * 6,
    rotateY: reduced ? 0 : d * -52,
    rotateZ: reduced ? 0 : d * -10,
    scale: 1 - ad * 0.17,
    opacity: Math.max(0, 1 - ad * 0.38),
    z: -ad * 95,
  };
}
