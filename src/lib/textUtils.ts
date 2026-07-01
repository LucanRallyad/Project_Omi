/** Normalize description text from any API (HTML or plain). */

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function stripHtml(raw: string): string {
  return decodeEntities(
    raw.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
  );
}

export function cleanDescription(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = stripHtml(raw).trim();
  if (text.length < 40) return null;
  return text;
}

/** Prefer the longest usable description across sources. */
export function pickBestDescription(...candidates: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const candidate of candidates) {
    const clean = cleanDescription(candidate);
    if (!clean) continue;
    if (!best || clean.length > best.length) best = clean;
  }
  return best;
}
