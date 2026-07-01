const HARDCOVER_GRAPHQL = "https://api.hardcover.app/v1/graphql";

interface HardcoverGraphQLResult {
  data?: unknown;
  errors?: { message?: string }[];
}

async function executeHardcoverGraphQL(
  query: string,
  variables: Record<string, unknown> | undefined,
  token: string
): Promise<HardcoverGraphQLResult> {
  const authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  const res = await fetch(HARDCOVER_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Hardcover HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  return (await res.json()) as HardcoverGraphQLResult;
}

interface VercelRequest {
  method?: string;
  body?: string | { query?: string; variables?: Record<string, unknown> };
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
}

function parseBody(
  body: VercelRequest["body"]
): { query?: string; variables?: Record<string, unknown> } {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as { query?: string; variables?: Record<string, unknown> };
    } catch {
      return {};
    }
  }
  return body;
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

  const { query, variables } = parseBody(req.body);
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
