import { motion } from "framer-motion";
import { Undo2 } from "lucide-react";
import type { SwipeDirection } from "../types";

interface UndoToastProps {
  direction: SwipeDirection;
  title: string;
  onUndo: () => void;
}

export function UndoToast({ direction, title, onUndo }: UndoToastProps) {
  return (
    <motion.div
      initial={{ y: 60, x: "-50%", opacity: 0 }}
      animate={{ y: 0, x: "-50%", opacity: 1 }}
      exit={{ y: 60, x: "-50%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="fixed bottom-6 left-1/2 z-40 flex items-center gap-3 rounded-full bg-espresso px-5 py-3 text-sm text-cream shadow-card"
      style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
    >
      <span className="max-w-[45vw] truncate">
        {direction === "like" ? "Loved" : "Passed"} “{title}”
      </span>
      <button
        type="button"
        onClick={onUndo}
        className="flex items-center gap-1 rounded-full bg-cream/15 px-3 py-1 font-semibold text-cream transition-colors hover:bg-cream/25"
      >
        <Undo2 size={14} /> Undo
      </button>
    </motion.div>
  );
}
