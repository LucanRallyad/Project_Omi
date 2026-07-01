import { motion } from "framer-motion";
import { Compass, Heart, Bookmark, BookMarked, GitGraph } from "lucide-react";
import type { ShelfView } from "../types";

interface NavBarProps {
  view: ShelfView;
  onChange: (view: ShelfView) => void;
  dark?: boolean;
  /** Slide off-screen on mobile when a detail overlay is open. */
  hidden?: boolean;
}

const tabs: { id: ShelfView; label: string; icon: typeof Compass }[] = [
  { id: "discover", label: "Discover", icon: Compass },
  { id: "saved", label: "Saved", icon: Bookmark },
  { id: "liked", label: "Loved", icon: Heart },
  { id: "want-to-read", label: "Want to Read", icon: BookMarked },
  { id: "reading-map", label: "Map", icon: GitGraph },
];

export function NavBar({ view, onChange, dark = false, hidden = false }: NavBarProps) {
  return (
    <motion.nav
      initial={{ y: -60, x: "-50%", opacity: 0 }}
      animate={{
        y: hidden ? -72 : 0,
        x: "-50%",
        opacity: hidden ? 0 : 1,
      }}
      transition={{ type: "spring", stiffness: hidden ? 320 : 260, damping: hidden ? 32 : 26 }}
      className={`fixed left-1/2 z-[60] flex max-w-[calc(100vw-1.5rem)] items-center gap-0.5 rounded-full px-1.5 py-1.5 shadow-soft ${
        dark ? "glass-dark" : "glass"
      }`}
      style={{
        top: "max(1rem, env(safe-area-inset-top))",
        pointerEvents: hidden ? "none" : "auto",
      }}
    >
      {tabs.map((tab) => {
        const active = view === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className="relative flex touch-manipulation items-center gap-1.5 rounded-full px-2.5 py-2.5 text-sm font-medium transition-colors sm:px-3.5"
          >
            {active && (
              <motion.span
                layoutId="nav-pill"
                className="absolute inset-0 rounded-full bg-rose"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span
              className={`relative z-10 ${active ? "text-white" : dark ? "text-white/65" : "text-espresso/70"}`}
            >
              <Icon size={16} strokeWidth={2.2} />
            </span>
            <span
              className={`relative z-10 hidden sm:inline ${active ? "text-white" : dark ? "text-white/65" : "text-espresso/70"}`}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </motion.nav>
  );
}
