import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import type { Book } from "../types";
import { BookCover } from "./BookCover";

export interface ShelfItem {
  book: Book;
  coverUrl: string | null;
}

interface ShelfProps {
  title: string;
  subtitle: string;
  items: ShelfItem[];
  onOpen: (book: Book) => void;
  onRemove?: (book: Book) => void;
  removeLabel?: string;
  dark?: boolean;
}

export function Shelf({ title, subtitle, items, onOpen, onRemove, removeLabel, dark = false }: ShelfProps) {
  return (
    <div className="h-full overflow-y-auto no-scrollbar px-4 pb-[max(5rem,env(safe-area-inset-bottom))] pt-[max(5.5rem,calc(env(safe-area-inset-top)+4rem))] sm:px-5">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 px-1">
          <h2 className={`font-display text-4xl font-semibold ${dark ? "text-white" : "text-espresso"}`}>
            {title}
          </h2>
          <p className={`mt-1 ${dark ? "text-white/60" : "text-espresso/60"}`}>{subtitle}</p>
        </header>

        <motion.div
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
        >
          {items.map(({ book, coverUrl }) => (
            <motion.div
              key={book.key}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              whileHover={{ y: -6 }}
              className="group relative"
            >
              <button
                type="button"
                onClick={() => onOpen(book)}
                className="block aspect-[2/3] w-full overflow-hidden rounded-2xl shadow-soft transition-shadow group-hover:shadow-card"
              >
                <BookCover
                  book={book}
                  coverUrl={coverUrl ?? book.seedCoverUrl ?? null}
                />
              </button>

              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(book)}
                  className="absolute right-2 top-2 flex h-9 w-9 touch-manipulation items-center justify-center rounded-full glass opacity-100 shadow-soft sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100"
                  aria-label={removeLabel ?? "Remove"}
                >
                  <Trash2 size={15} className="text-rose" />
                </button>
              )}

              <div className="mt-2 px-0.5">
                <p className="truncate font-medium text-espresso">{book.title}</p>
                <p className="truncate text-sm text-espresso/55">{book.author}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
