import { useEffect, useState } from "react";
import type { Book, BookMeta } from "../types";
import { fetchBookMeta, fetchBookMetaQuick } from "../lib/bookApi";
import { getCachedMeta } from "../lib/cache";
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

function initialMeta(book: Book | null): BookMeta {
  if (!book) return EMPTY;
  const description = getLibraryDescription(book.key);
  return description ? { ...EMPTY, description } : EMPTY;
}

export function useBookMeta(book: Book | null) {
  const [meta, setMeta] = useState<BookMeta>(() => initialMeta(book));
  const [loading, setLoading] = useState(() => !initialMeta(book).description);

  useEffect(() => {
    if (!book) {
      setMeta(EMPTY);
      setLoading(false);
      return;
    }

    const baked = getLibraryDescription(book.key);
    const seed = baked ? { ...EMPTY, description: baked } : EMPTY;
    setMeta(seed);
    setLoading(!baked);

    let cancelled = false;

    (async () => {
      const cached = await getCachedMeta(book.key);
      if (cancelled) return;

      if (cached?.description) {
        setMeta(cached);
        setLoading(false);
        return;
      }

      const quick = await fetchBookMetaQuick(book, baked, cached);
      if (cancelled) return;

      setMeta(quick);
      if (quick.description) {
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
