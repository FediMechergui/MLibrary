import { sourceDirectory, searchCatalog, validateSearch } from "./catalog.mjs";
import { cachedSearch, store } from "./storage.mjs";
import { getContent } from "./content.mjs";
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "X-Content-Type-Options": "nosniff",
};
export default async function handler(request) {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "GET")
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers },
    );
  const url = new URL(request.url),
    path = url.pathname.replace(/^\/(?:api|\.netlify\/functions\/api)/, "");
  try {
    if (path === "/health")
      return Response.json(
        { status: "ok", version: "0.2.0", time: new Date().toISOString() },
        { headers },
      );
    if (path === "/sources")
      return Response.json({ sources: sourceDirectory }, { headers });
    if (path === "/sync-status") {
      let state;
      try {
        state = await store().get("sync/state", { type: "json" });
      } catch {
        /* Report not initialized. */
      }
      return Response.json(
        state || { status: "not-run", pages: 0, records: 0 },
        { headers },
      );
    }
    if (path === "/search") {
      let options;
      try {
        options = validateSearch(url.searchParams);
      } catch (e) {
        return Response.json({ error: e.message }, { status: 400, headers });
      }
      const data = await cachedSearch(options, searchCatalog);
      return Response.json(data, {
        status: data.sources.length ? 200 : 503,
        headers: {
          ...headers,
          "Cache-Control":
            data.errors.length || data.stale
              ? "no-store"
              : "public, max-age=300",
          "Netlify-CDN-Cache-Control":
            data.errors.length || data.stale
              ? "no-store"
              : "public, s-maxage=900, stale-while-revalidate=3600",
        },
      });
    }
    if (path === "/content") {
      const data = await getContent(url.searchParams.get("id") || "", { language: url.searchParams.get("language") || "en", chapter: url.searchParams.get("chapter") || undefined });
      return Response.json(data, {
        headers: { ...headers, "Cache-Control": "public, max-age=300" },
      });
    }
    return Response.json({ error: "Not found" }, { status: 404, headers });
  } catch (error) {
    console.error("API request failed:", error.message);
    return Response.json(
      {
        error:
          path === "/content"
            ? error.message
            : "The catalogue is temporarily unavailable. Please try again.",
      },
      {
        status:
          path === "/content" && error.message === "Unsupported book identifier"
            ? 400
            : 502,
        headers,
      },
    );
  }
}
