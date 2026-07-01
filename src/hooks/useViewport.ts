import { useEffect, useState } from "react";

export interface Viewport {
  width: number;
  height: number;
  isMobile: boolean;
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1200,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
    isMobile: typeof window !== "undefined" ? window.innerWidth < 768 : false,
  }));

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setVp({
          width: window.innerWidth,
          height: window.innerHeight,
          isMobile: window.innerWidth < 768,
        })
      );
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(frame);
    };
  }, []);

  return vp;
}
