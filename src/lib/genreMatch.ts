/** Map profile genre labels to API category substrings (case-insensitive). */
const GENRE_ALIASES: Record<string, string[]> = {
  Romance: ["romance", "love story", "romantic fiction", "contemporary romance", "new adult romance"],
  "Romantic comedy": ["rom-com", "romcom", "romantic comedy", "romantic comed", "humor", "humour"],
  LGBT: ["lgbt", "lgbtq", "queer", "gay", "lesbian", "bisexual", "sapphic", "mlm", "wlw"],
  Fiction: ["fiction", "literary", "general fiction", "novel", "booktok"],
  Fantasy: ["fantasy", "fae", "romantasy", "magic", "faerie", "high fantasy", "urban fantasy"],
  "Young Adult": ["young adult", " ya", "ya ", "teen", "ya fiction"],
  Thriller: ["thriller", "mystery", "suspense", "crime", "psychological", "detective"],
};

function matchesGenre(category: string, genre: string): boolean {
  const cat = category.toLowerCase();
  const aliases = GENRE_ALIASES[genre] ?? [genre.toLowerCase()];
  return aliases.some((alias) => cat.includes(alias) || alias.includes(cat));
}

/** Score API categories against weighted profile genres with fuzzy matching. */
export function genreScoreForCategories(
  categories: string[],
  genreWeights: Map<string, number>
): number {
  if (!categories.length || !genreWeights.size) return 0;

  let score = 0;
  for (const [genre, weight] of genreWeights) {
    if (weight <= 0) continue;
    if (categories.some((cat) => matchesGenre(cat, genre))) {
      score += weight * 1.2;
    }
  }
  return score;
}

/** Normalize a raw API category to a canonical profile genre when possible. */
export function canonicalGenre(category: string): string {
  const trimmed = category.trim();
  for (const genre of Object.keys(GENRE_ALIASES)) {
    if (matchesGenre(trimmed, genre)) return genre;
  }
  return trimmed;
}
