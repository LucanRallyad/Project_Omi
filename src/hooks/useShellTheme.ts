import { useEffect } from "react";

const THEME = {
  light: "#F5F0E8",
  dark: "#1A1615",
} as const;

/** Sync html background + browser chrome color with the active shell. */
export function useShellTheme(): void {
  useEffect(() => {
    document.documentElement.dataset.shell = "light";

    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", THEME.light);

    return () => {
      delete document.documentElement.dataset.shell;
      meta?.setAttribute("content", THEME.light);
    };
  }, []);
}
