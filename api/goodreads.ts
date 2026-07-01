import { fetchGoodreadsDescription } from "../lib/goodreadsScrape";

interface VercelRequest {
  method?: string;
  query?: { url?: string };
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const url = req.query?.url;
  if (!url || !url.includes("goodreads.com/book/show/")) {
    res.status(400).json({ error: "Missing or invalid Goodreads book URL" });
    return;
  }

  try {
    const description = await fetchGoodreadsDescription(url);
    res.status(200).json({ description });
  } catch {
    res.status(502).json({ error: "Goodreads request failed" });
  }
}
