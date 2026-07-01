import type { Book } from "../types";

/** Deterministic per-book hash for stable palette + layout. */
function bookHash(key: string): number {
  return [...key].reduce((a, c) => a + c.charCodeAt(0), 0);
}

/** Clothbound / hardcover palettes inspired by indie bookstore spines. */
const BINDINGS = [
  { cover: "#5C2E36", accent: "#C9A961", foil: "#F5E6C8" },
  { cover: "#2E4A62", accent: "#D4C5A9", foil: "#F0EDE4" },
  { cover: "#3D5248", accent: "#C9A961", foil: "#EDE8DC" },
  { cover: "#4A3D5C", accent: "#E8D5B7", foil: "#F5F0E8" },
  { cover: "#6B4423", accent: "#C9A961", foil: "#FAF3E6" },
  { cover: "#7A3B4A", accent: "#D4849A", foil: "#FFF5F7" },
  { cover: "#3B4D6B", accent: "#C9A961", foil: "#EEF1F6" },
  { cover: "#4D3B2E", accent: "#C9A961", foil: "#F5F0E8" },
  { cover: "#2F4F4F", accent: "#B8C9A9", foil: "#F0F4EC" },
  { cover: "#5C4033", accent: "#D4849A", foil: "#FAF0EB" },
] as const;

function dropCap(title: string): string {
  const match = title.match(/[A-Za-z0-9]/);
  return match ? match[0].toUpperCase() : "?";
}

interface CoverFallbackProps {
  book: Book;
  /** Show title/author on the cover itself. Off when the parent already labels the book. */
  showTitle?: boolean;
}

/**
 * Fallback when no cover art is found: a clothbound-style mock cover with a
 * deterministic jewel-tone binding, linen texture, and gold drop cap — meant
 * to feel like a real book spine, not a placeholder.
 */
export function CoverFallback({ book, showTitle = false }: CoverFallbackProps) {
  const hash = bookHash(book.key);
  const binding = BINDINGS[hash % BINDINGS.length];
  const initial = dropCap(book.title);
  const gid = `cloth-${hash}`;
  const seed = hash % 360;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 300 450"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <linearGradient id={`${gid}-base`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={binding.cover} stopOpacity={1} />
            <stop offset="100%" stopColor={binding.cover} stopOpacity={0.82} />
          </linearGradient>
          <filter id={`${gid}-linen`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" seed={seed} />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.07" />
            </feComponentTransfer>
          </filter>
          <linearGradient id={`${gid}-sheen`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="35%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.12" />
          </linearGradient>
        </defs>

        {/* Base cloth color */}
        <rect width="300" height="450" fill={`url(#${gid}-base)`} />

        {/* Linen weave texture */}
        <rect width="300" height="450" filter={`url(#${gid}-linen)`} opacity={0.9} />

        {/* Light sheen across the cover */}
        <rect width="300" height="450" fill={`url(#${gid}-sheen)`} />

        {/* Inset gold frame — hardcover edge */}
        <rect
          x="18"
          y="18"
          width="264"
          height="414"
          fill="none"
          stroke={binding.accent}
          strokeWidth="1.2"
          opacity={0.55}
          rx="2"
        />
        <rect
          x="24"
          y="24"
          width="252"
          height="402"
          fill="none"
          stroke={binding.accent}
          strokeWidth="0.5"
          opacity={0.3}
          rx="1"
        />

        {/* Corner flourishes */}
        {[
          [28, 28],
          [272, 28],
          [28, 422],
          [272, 422],
        ].map(([cx, cy], i) => (
          <g key={i} transform={`translate(${cx} ${cy})`} opacity={0.45}>
            <path
              d={i % 2 === 0 ? "M0 0 L14 0 M0 0 L0 14" : "M0 0 L-14 0 M0 0 L0 14"}
              stroke={binding.accent}
              strokeWidth="1"
              fill="none"
            />
          </g>
        ))}

        {/* Drop cap */}
        <text
          x="150"
          y="215"
          textAnchor="middle"
          fill={binding.foil}
          fontFamily="Cormorant Garamond, Georgia, serif"
          fontSize="112"
          fontWeight="600"
          opacity={0.92}
        >
          {initial}
        </text>
        <text
          x="150"
          y="215"
          textAnchor="middle"
          fill={binding.accent}
          fontFamily="Cormorant Garamond, Georgia, serif"
          fontSize="112"
          fontWeight="600"
          opacity={0.35}
          transform="translate(1.5, 2)"
        >
          {initial}
        </text>

        {/* Thin rule under initial */}
        <line
          x1="90"
          y1="248"
          x2="210"
          y2="248"
          stroke={binding.accent}
          strokeWidth="0.75"
          opacity={0.5}
        />
      </svg>

      {showTitle && (
        <div className="absolute inset-x-0 bottom-0 px-6 pb-8 pt-16 text-center">
          <div
            className="mx-auto max-w-[85%] border-t border-white/20 pt-4"
            style={{ borderColor: `${binding.accent}66` }}
          >
            <p
              className="font-display text-lg font-semibold leading-snug"
              style={{ color: binding.foil }}
            >
              {book.title}
            </p>
            <p
              className="mt-1.5 font-sans text-[10px] uppercase tracking-[0.22em]"
              style={{ color: binding.foil, opacity: 0.72 }}
            >
              {book.author}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Other fallback directions we considered (swap in CoverFallback if preferred):
 *
 * 1. Clothbound mock (current) — jewel-tone binding + gold drop cap
 * 2. Minimal cream typographic — plain paper texture, title only, no decoration
 * 3. Spine stub — narrow side-view with rotated title text
 * 4. Open-book paper — cream spread with deckle edges (reference: 2462974793287164.jpeg)
 */
