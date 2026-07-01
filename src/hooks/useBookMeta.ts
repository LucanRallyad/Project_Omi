import { useEffect, useState } from "react";
import type { Book, BookMeta } from "../types";
import { fetchBookMeta } from "../lib/bookApi";

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

export function useBookMeta(book: Book | null) {
  const [meta, setMeta] = useState<BookMeta>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!book) {
      setMeta(EMPTY);
      return;
    }
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
