import type { LibraryBook, ShelfTag } from "../types";

export type LinkKind = "series" | "author" | "tag";

export interface GraphNode {
  id: string;
  title: string;
  author: string;
  tags: ShelfTag[];
  series: string | null;
  rating: number | null;
  /** Number of connections — drives node size like Obsidian. */
  degree: number;
  color: string;
}

export interface GraphLink {
  source: string;
  target: string;
  kind: LinkKind;
}

import { OBSIDIAN_COLORS, OBSIDIAN_GROUP_COLORS } from "./obsidianGraphConfig";

const DEFAULT_NODE_COLOR = OBSIDIAN_COLORS.node;

function linkKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function nodeColor(book: LibraryBook): string {
  for (const tag of ["favorites", "romance", "rom-coms", "lgbtq", "booktok"] as ShelfTag[]) {
    if (book.tags.includes(tag)) return OBSIDIAN_GROUP_COLORS[tag];
  }
  return DEFAULT_NODE_COLOR;
}

/** Chain adjacent items in a group to avoid O(n²) author/tag meshes. */
function chainLinks(ids: string[], kind: LinkKind, seen: Set<string>): GraphLink[] {
  const links: GraphLink[] = [];
  for (let i = 0; i < ids.length - 1; i++) {
    const key = linkKey(ids[i], ids[i + 1]);
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ source: ids[i], target: ids[i + 1], kind });
  }
  return links;
}

function sortBooks(books: LibraryBook[]): LibraryBook[] {
  return [...books].sort((a, b) => {
    const seriesCmp = (a.series ?? "").localeCompare(b.series ?? "");
    if (seriesCmp !== 0) return seriesCmp;
    const numA = a.seriesNumber ?? 999;
    const numB = b.seriesNumber ?? 999;
    if (numA !== numB) return numA - numB;
    return a.cleanTitle.localeCompare(b.cleanTitle);
  });
}

/** Build nodes and edges for all read books in the library. */
export function buildReadingGraph(books: LibraryBook[]): { nodes: GraphNode[]; links: GraphLink[] } {
  const read = sortBooks(books.filter((b) => b.status === "read"));
  const seen = new Set<string>();
  const links: GraphLink[] = [];

  const nodeMap = new Map<string, GraphNode>();
  for (const book of read) {
    nodeMap.set(book.key, {
      id: book.key,
      title: book.cleanTitle,
      author: book.author,
      tags: book.tags,
      series: book.series,
      rating: book.rating,
      degree: 0,
      color: nodeColor(book),
    });
  }

  // Series: connect consecutive volumes in each series.
  const bySeries = new Map<string, LibraryBook[]>();
  for (const book of read) {
    if (!book.series) continue;
    const group = bySeries.get(book.series) ?? [];
    group.push(book);
    bySeries.set(book.series, group);
  }
  for (const group of bySeries.values()) {
    const sorted = [...group].sort((a, b) => (a.seriesNumber ?? 0) - (b.seriesNumber ?? 0));
    links.push(...chainLinks(sorted.map((b) => b.key), "series", seen));
  }

  // Author: chain books by the same author (sorted by series/title).
  const byAuthor = new Map<string, LibraryBook[]>();
  for (const book of read) {
    const group = byAuthor.get(book.author) ?? [];
    group.push(book);
    byAuthor.set(book.author, group);
  }
  for (const group of byAuthor.values()) {
    if (group.length < 2) continue;
    links.push(...chainLinks(sortBooks(group).map((b) => b.key), "author", seen));
  }

  // Tags: chain books sharing each shelf tag.
  const tagKeys: ShelfTag[] = ["romance", "rom-coms", "booktok", "lgbtq", "favorites"];
  for (const tag of tagKeys) {
    const tagged = read.filter((b) => b.tags.includes(tag));
    if (tagged.length < 2) continue;
    links.push(...chainLinks(sortBooks(tagged).map((b) => b.key), "tag", seen));
  }

  // Degree counts for node sizing.
  for (const link of links) {
    const a = nodeMap.get(link.source);
    const b = nodeMap.get(link.target);
    if (a) a.degree += 1;
    if (b) b.degree += 1;
  }

  return { nodes: [...nodeMap.values()], links };
}
