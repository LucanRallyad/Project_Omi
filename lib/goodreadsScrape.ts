/** Shared Goodreads HTML parsing — used by the API route and build scripts. */

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
  return decodeEntities(raw.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

export function parseGoodreadsDescription(html: string): string | null {
  const patterns = [
    /<div[^>]*class="[^"]*DetailsPlotRoot[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<span[^>]*id="freeText[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
    /<div[^>]*id="description"[^>]*>([\s\S]*?)<\/div>/i,
    /property="og:description"\s+content="([^"]+)"/i,
    /content="([^"]+)"\s+property="og:description"/i,
    /<meta[^>]+name="description"[^>]+content="([^"]+)"/i,
  ];

  let best: string | null = null;
  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (!m?.[1]) continue;
    const text = stripHtml(m[1]).trim();
    if (text.length < 40) continue;
    if (!best || text.length > best.length) best = text;
  }

  const jsonLd = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
  for (const block of jsonLd) {
    try {
      const data = JSON.parse(block[1]) as { description?: string; "@graph"?: { description?: string }[] };
      const candidates = [
        data.description,
        ...(data["@graph"]?.map((n) => n.description) ?? []),
      ];
      for (const raw of candidates) {
        if (!raw) continue;
        const text = stripHtml(raw).trim();
        if (text.length >= 40 && (!best || text.length > best.length)) best = text;
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }

  return best;
}

export async function fetchGoodreadsDescription(pageUrl: string): Promise<string | null> {
  if (!pageUrl.includes("goodreads.com/book/show/")) return null;
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BooksForRomi/1.0; +https://project-omi.vercel.app)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return parseGoodreadsDescription(await res.text());
  } catch {
    return null;
  }
}
