import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";

const PASSCODE = import.meta.env.VITE_APP_PASSCODE;
const STORAGE_KEY = "romi.unlocked";

/**
 * Optional lightweight passcode gate. Disabled entirely unless VITE_APP_PASSCODE
 * is set. This is not real security — just a soft barrier for a public URL.
 */
export function PasscodeGate({ children }: { children: ReactNode }) {
  const enabled = Boolean(PASSCODE);
  const [unlocked, setUnlocked] = useState(
    () => !enabled || localStorage.getItem(STORAGE_KEY) === "1"
  );
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  if (unlocked) return <>{children}</>;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value === PASSCODE) {
      localStorage.setItem(STORAGE_KEY, "1");
      setUnlocked(true);
    } else {
      setError(true);
      setValue("");
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-warm px-8">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex w-full max-w-sm flex-col items-center text-center"
      >
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-blush/40 text-rose">
          <Lock size={26} />
        </div>
        <h1 className="font-display text-3xl font-semibold text-espresso">A little private</h1>
        <p className="mt-2 text-espresso/60">Enter the passcode to come in.</p>
        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          autoFocus
          className={`mt-6 w-full rounded-2xl border bg-white/70 px-4 py-3 text-center text-lg tracking-widest outline-none transition-colors ${
            error ? "border-rose" : "border-espresso/15 focus:border-rose"
          }`}
          placeholder="••••••"
        />
        {error && <p className="mt-2 text-sm text-rose">That's not quite it — try again.</p>}
        <button
          type="submit"
          className="mt-5 w-full rounded-2xl bg-rose py-3 font-semibold text-white shadow-soft transition-transform active:scale-95"
        >
          Unlock
        </button>
      </motion.form>
    </div>
  );
}
