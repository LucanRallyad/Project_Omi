/** Client wrapper for the server-side Goodreads metadata proxy. */

const PROXY = "/api/goodreads";

export async function fetchGoodreadsDescription(goodreadsUrl: string): Promise<string | null> {
  if (!goodreadsUrl.includes("goodreads.com/book/show/")) return null;
  try {
    const res = await fetch(`${PROXY}?url=${encodeURIComponent(goodreadsUrl)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { description?: string | null };
    return data.description?.trim() || null;
  } catch {
    return null;
  }
}
