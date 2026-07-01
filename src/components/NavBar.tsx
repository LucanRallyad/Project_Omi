import { motion } from "framer-motion";
import { Compass, Heart, Bookmark, BookMarked } from "lucide-react";
import type { ShelfView } from "../types";

interface NavBarProps {
  view: ShelfView;
  onChange: (view: ShelfView) => void;
  savedCount: number;
  likedCount: number;
}

const tabs: { id: ShelfView; label: string; icon: typeof Compass }[] = [
  { id: "discover", label: "Discover", icon: Compass },
  { id: "saved", label: "Saved", icon: Bookmark },
  { id: "liked", label: "Loved", icon: Heart },
  { id: "want-to-read", label: "Want to Read", icon: BookMarked },
];

export function NavBar({ view, onChange, savedCount, likedCount }: NavBarProps) {
  return (
    <motion.nav
      initial={{ y: -60, x: "-50%", opacity: 0 }}
      animate={{ y: 0, x: "-50%", opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 24, delay: 0.1 }}
      className="pointer-events-auto fixed left-1/2 top-4 z-40 flex max-w-[calc(100vw-1.5rem)] items-center gap-0.5 rounded-full glass px-1.5 py-1.5 shadow-soft"
    >
      {tabs.map((tab) => {
        const active = view === tab.id;
        const Icon = tab.icon;
        const count =
          tab.id === "saved" ? savedCount : tab.id === "liked" ? likedCount : 0;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className="relative flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors sm:px-4"
          >
            {active && (
              <motion.span
                layoutId="nav-pill"
                className="absolute inset-0 rounded-full bg-rose"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className={`relative z-10 ${active ? "text-white" : "text-espresso/70"}`}>
              <Icon size={16} strokeWidth={2.2} />
            </span>
            <span
              className={`relative z-10 hidden sm:inline ${active ? "text-white" : "text-espresso/70"}`}
            >
              {tab.label}
            </span>
            {count > 0 && (
              <span
                className={`relative z-10 rounded-full px-1.5 text-[10px] font-bold ${
                  active ? "bg-white/25 text-white" : "bg-rose/15 text-rose"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </motion.nav>
  );
}
