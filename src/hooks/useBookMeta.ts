import { useEffect, useState } from "react";
import type { Book, BookMeta } from "../types";
import { fetchBookMeta, fetchBookMetaQuick } from "../lib/bookApi";
import { getCachedMeta, getCachedMetaSync, setCachedMeta } from "../lib/cache";
import { getLibraryDescription } from "../lib/libraryDescriptions";

const EMPTY: BookMeta = {
  coverUrl: null,
  description: null,
  categories: [],
  price: null,
  buyUrl: "",
  pageCount: null,
  publishedDate: null,
  previewLink: null,
};

function resolveInstantMeta(book: Book | null): BookMeta {
  if (!book) return EMPTY;
  const baked = getLibraryDescription(book.key);
  const cached = getCachedMetaSync(book.key);
  if (cached?.description) return cached;
  if (baked) return { ...EMPTY, description: baked };
  return EMPTY;
}

export function useBookMeta(book: Book | null) {
  const [meta, setMeta] = useState<BookMeta>(() => resolveInstantMeta(book));
  const [loading, setLoading] = useState(() => !resolveInstantMeta(book).description);

  useEffect(() => {
    if (!book) {
      setMeta(EMPTY);
      setLoading(false);
      return;
    }

    const instant = resolveInstantMeta(book);
    setMeta(instant);
    if (instant.description) {
      setLoading(false);
      return;
    }
    setLoading(true);

    let cancelled = false;

    (async () => {
      const cached = await getCachedMeta(book.key);
      if (cancelled) return;
      if (cached?.description) {
        setMeta(cached);
        setLoading(false);
        return;
      }

      const baked = getLibraryDescription(book.key);
      const quick = await fetchBookMetaQuick(book, baked, cached);
      if (cancelled) return;

      setMeta(quick);
      if (quick.description) {
        void setCachedMeta(book.key, quick);
        setLoading(false);
        return;
      }

      const full = await fetchBookMeta(book);
      if (!cancelled) {
        setMeta(full);
        setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [book]);

  return { meta, loading };
}
