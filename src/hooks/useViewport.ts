import { useEffect, useState } from "react";

export interface Viewport {
  width: number;
  height: number;
  isMobile: boolean;
}

function readViewport(): Viewport {
  if (typeof window === "undefined") {
    return { width: 1200, height: 800, isMobile: false };
  }
  const vv = window.visualViewport;
  const width = vv?.width ?? window.innerWidth;
  const height = vv?.height ?? window.innerHeight;
  return {
    width,
    height,
    isMobile: width < 768,
  };
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(readViewport);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setVp(readViewport()));
    };
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
      cancelAnimationFrame(frame);
    };
  }, []);

  return vp;
}
