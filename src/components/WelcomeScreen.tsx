import { motion } from "framer-motion";

interface WelcomeScreenProps {
  onEnter: () => void;
}

/** Falling petal positions, deterministic so SSR/CSR match. */
const petals = Array.from({ length: 18 }).map((_, i) => ({
  left: (i * 53) % 100,
  delay: (i % 6) * 0.6,
  duration: 7 + (i % 5),
  size: 10 + (i % 4) * 6,
  rotate: (i * 47) % 360,
}));

export function WelcomeScreen({ onEnter }: WelcomeScreenProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-warm"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, pointerEvents: "none" }}
      transition={{ duration: 0.7 }}
    >
      {/* Falling petals */}
      {petals.map((p, i) => (
        <motion.div
          key={i}
          className="pointer-events-none absolute -top-10"
          style={{ left: `${p.left}%` }}
          initial={{ y: -60, rotate: p.rotate, opacity: 0 }}
          animate={{ y: "110vh", rotate: p.rotate + 180, opacity: [0, 0.8, 0.8, 0] }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeIn",
          }}
        >
          <svg width={p.size} height={p.size} viewBox="0 0 20 20">
            <path
              d="M10 0 C14 6 20 8 10 20 C0 8 6 6 10 0 Z"
              fill="#F4C2C2"
              opacity={0.85}
            />
          </svg>
        </motion.div>
      ))}

      <motion.div
        className="relative z-10 flex flex-col items-center px-8 text-center"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.p
          className="mb-3 text-sm uppercase tracking-[0.4em] text-rose"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          Made for
        </motion.p>
        <h1 className="font-display text-5xl font-semibold text-espresso sm:text-7xl md:text-8xl">Romi</h1>
        <p className="mt-5 max-w-sm text-espresso/70">
          A little corner of the internet full of your next favorite books — chosen just for you,
          and getting smarter every time you swipe.
        </p>

        <motion.button
          type="button"
          onClick={onEnter}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="mt-10 touch-manipulation rounded-full bg-rose px-10 py-4 font-semibold text-white shadow-glow"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
        >
          Find me a book
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
