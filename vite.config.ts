import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { executeHardcoverGraphQL } from "./lib/hardcoverProxy";
import { fetchGoodreadsDescription } from "./lib/goodreadsScrape";

function apiDevProxies(env: Record<string, string>): Plugin {
  return {
    name: "api-dev-proxies",
    configureServer(server) {
      server.middlewares.use("/api/hardcover", async (req, res) => {
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          res.end();
          return;
        }

        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const token = env.HARDCOVER_API_TOKEN;
        if (!token) {
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Hardcover API not configured" }));
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", async () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString()) as {
              query?: string;
              variables?: Record<string, unknown>;
            };
            if (!body.query) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Missing GraphQL query" }));
              return;
            }
            const result = await executeHardcoverGraphQL(body.query, body.variables, token);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result));
          } catch {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Hardcover request failed" }));
          }
        });
      });

      server.middlewares.use("/api/goodreads", async (req, res) => {
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          res.end();
          return;
        }

        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        try {
          const url = new URL(req.url ?? "", "http://localhost").searchParams.get("url");
          if (!url || !url.includes("goodreads.com/book/show/")) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Missing or invalid Goodreads book URL" }));
            return;
          }
          const description = await fetchGoodreadsDescription(url);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ description }));
        } catch {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Goodreads request failed" }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("framer-motion")) return "motion";
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("react-dom") || id.includes("react/")) return "react-vendor";
          },
        },
      },
    },
    plugins: [
      react(),
      apiDevProxies(env),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg"],
        manifest: {
          name: "Books for Romi",
          short_name: "Romi Books",
          description: "A cozy book recommender made just for Romi.",
          theme_color: "#F5F0E8",
          background_color: "#F5F0E8",
          display: "standalone",
          orientation: "portrait",
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
    ],
  };
});
