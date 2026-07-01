import { useEffect } from "react";

const THEME = {
  light: "#F5F0E8",
  dark: "#1A1615",
} as const;

/** Sync html background + browser chrome color with the active shell (mobile = dark immersive). */
export function useShellTheme(isMobile: boolean, obsidian = false): void {
  useEffect(() => {
    const mode = obsidian || isMobile ? "dark" : "light";
    document.documentElement.dataset.shell = mode;

    const meta = document.querySelector('meta[name="theme-color"]');
    const color = obsidian ? "#1e1e1e" : THEME[mode];
    meta?.setAttribute("content", color);

    return () => {
      delete document.documentElement.dataset.shell;
      meta?.setAttribute("content", THEME.light);
    };
  }, [isMobile, obsidian]);
}
