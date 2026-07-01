import { useEffect, useState } from "react";
import type { Book, BookMeta } from "../types";
import { fetchBookMeta } from "../lib/bookApi";
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!book) {
      setMeta(EMPTY);
      return;
    }
    setMeta(initialMeta(book));
    let cancelled = false;
    setLoading(true);
    fetchBookMeta(book)
      .then((m) => {
        if (!cancelled) setMeta(m);
      })
      .catch(() => {
        if (!cancelled) setMeta(EMPTY);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [book]);

  return { meta, loading };
}
