import { useState } from "react";
import { motion } from "framer-motion";
import type { Book } from "../types";
import { CoverFallback } from "./CoverFallback";

interface BookCoverProps {
  book: Book;
  coverUrl: string | null;
  layoutId?: string;
  /** Center / hero card — eager load + high fetch priority. */
  priority?: boolean;
  className?: string;
}

/**
 * Cover image with a clothbound placeholder underneath, fade-in on load, and
 * graceful fallback if the URL 404s (common with Open Library ISBN misses).
 */
export function BookCover({
  book,
  coverUrl,
  layoutId,
  priority = false,
  className = "h-full w-full object-cover",
}: BookCoverProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const showImage = coverUrl && !failed;

  const inner = (
    <div className="relative h-full w-full">
      <CoverFallback book={book} showTitle={false} />
      {showImage && (
        <img
          src={coverUrl}
          alt={`Cover of ${book.title}`}
          className={`absolute inset-0 ${className} transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          {...(priority ? { fetchpriority: "high" as const } : {})}
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );

  if (layoutId) {
    return (
      <motion.div layoutId={layoutId} className="h-full w-full">
        {inner}
      </motion.div>
    );
  }

  return inner;
}
