import { useEffect } from "react";

const THEME = {
  light: "#F5F0E8",
  dark: "#1A1615",
} as const;

/** Sync html background + browser chrome color with the active shell (mobile = dark immersive). */
export function useShellTheme(isMobile: boolean): void {
  useEffect(() => {
    const mode = isMobile ? "dark" : "light";
    document.documentElement.dataset.shell = mode;

    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", THEME[mode]);

    return () => {
      delete document.documentElement.dataset.shell;
      meta?.setAttribute("content", THEME.light);
    };
  }, [isMobile]);
}
