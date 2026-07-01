/** Shared Hardcover GraphQL proxy logic (Vercel API route + Vite dev middleware). */

const HARDCOVER_GRAPHQL = "https://api.hardcover.app/v1/graphql";

export interface HardcoverGraphQLResult {
  data?: unknown;
  errors?: { message?: string }[];
}

export async function executeHardcoverGraphQL(
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
