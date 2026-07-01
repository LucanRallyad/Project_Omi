/** Lightweight cover URL validation — OL ISBN CDN often 404s or returns a 1×1 placeholder. */

const probeCache = new Map<string, boolean>();

export async function probeCoverUrl(url: string): Promise<boolean> {
  const hit = probeCache.get(url);
  if (hit !== undefined) return hit;

  const ok = await new Promise<boolean>((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => {
      resolve(false);
    }, 4500);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img.naturalWidth > 40 && img.naturalHeight > 40);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });

  probeCache.set(url, ok);
  return ok;
}

export async function firstValidCoverUrl(
  urls: (string | null | undefined)[],
  concurrency = 3
): Promise<string | null> {
  const unique = [...new Set(urls.filter((u): u is string => Boolean(u)))];
  if (!unique.length) return null;

  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((url) => probeCoverUrl(url).then((ok) => (ok ? url : null))));
    const winner = results.find(Boolean);
    if (winner) return winner;
  }
  return null;
}
