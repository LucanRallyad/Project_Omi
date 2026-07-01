import { executeHardcoverGraphQL } from "../lib/hardcoverProxy";

interface VercelRequest {
  method?: string;
  body?: { query?: string; variables?: Record<string, unknown> };
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
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.HARDCOVER_API_TOKEN;
  if (!token) {
    res.status(503).json({ error: "Hardcover API not configured" });
    return;
  }

  const { query, variables } = req.body ?? {};
  if (!query) {
    res.status(400).json({ error: "Missing GraphQL query" });
    return;
  }

  try {
    const result = await executeHardcoverGraphQL(query, variables, token);
    res.status(200).json(result);
  } catch {
    res.status(502).json({ error: "Hardcover request failed" });
  }
}
