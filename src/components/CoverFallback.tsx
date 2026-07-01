import type { Book } from "../types";

/**
 * Elegant fallback cover for books without artwork: a soft pink botanical
 * pattern with the title and author typeset in serif. Deterministic per-book so
 * the same book always gets the same floral arrangement.
 */
export function CoverFallback({ book }: { book: Book }) {
  // Stable hash from the key to vary the palette + bloom positions per book.
  const hash = [...book.key].reduce((a, c) => a + c.charCodeAt(0), 0);
  const palettes = [
    ["#F9E4E9", "#F4C2C2", "#D4849A"],
    ["#FBEAF0", "#F3C6D6", "#C97A98"],
    ["#F7E8E4", "#F1C4B8", "#D08A7A"],
    ["#F6E9F0", "#E7C4DE", "#B98CB8"],
  ];
  const [bg, mid, accent] = palettes[hash % palettes.length];
  const gid = `bloom-${hash}`;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 300 450"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <radialGradient id={gid} cx="50%" cy="30%" r="90%">
            <stop offset="0%" stopColor={bg} />
            <stop offset="100%" stopColor={mid} />
          </radialGradient>
        </defs>
        <rect width="300" height="450" fill={`url(#${gid})`} />
        {/* Scattered blooms */}
        {Array.from({ length: 7 }).map((_, i) => {
          const seed = (hash + i * 53) % 300;
          const cx = 30 + (seed % 240);
          const cy = 40 + ((seed * 7) % 380);
          const r = 14 + (seed % 16);
          const petals = 6;
          return (
            <g key={i} transform={`translate(${cx} ${cy})`} opacity={0.55}>
              {Array.from({ length: petals }).map((__, p) => (
                <ellipse
                  key={p}
                  rx={r * 0.5}
                  ry={r}
                  fill={accent}
                  opacity={0.5}
                  transform={`rotate(${(360 / petals) * p}) translate(0 ${-r * 0.6})`}
                />
              ))}
              <circle r={r * 0.35} fill="#C9A961" opacity={0.85} />
            </g>
          );
        })}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <div className="rounded-2xl bg-white/35 px-5 py-6 backdrop-blur-sm">
          <p className="font-display text-2xl font-semibold leading-tight text-espresso drop-shadow-sm">
            {book.title}
          </p>
          <div className="mx-auto my-3 h-px w-10 bg-espresso/40" />
          <p className="font-sans text-xs uppercase tracking-[0.2em] text-espresso/70">
            {book.author}
          </p>
        </div>
      </div>
    </div>
  );
}
