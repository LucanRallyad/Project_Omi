import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
  dark?: boolean;
}

export function EmptyState({ icon, title, message, action, dark = false }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full min-h-0 flex-col items-center justify-center px-6 py-[max(1rem,env(safe-area-inset-bottom))] text-center sm:px-8"
    >
      <div
        className={`mb-5 flex h-20 w-20 items-center justify-center rounded-full ${
          dark ? "bg-white/10 text-rose" : "bg-blush/40 text-rose"
        }`}
      >
        {icon}
      </div>
      <h3 className={`font-display text-3xl font-semibold ${dark ? "text-white" : "text-espresso"}`}>
        {title}
      </h3>
      <p className={`mt-2 max-w-xs ${dark ? "text-white/65" : "text-espresso/65"}`}>{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-6 touch-manipulation rounded-full bg-rose px-8 py-3 font-semibold text-white shadow-soft transition-transform active:scale-95"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
}
