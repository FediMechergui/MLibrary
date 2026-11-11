import {
  sourceDirectory,
  searchCatalog,
  validateSearch,
  SOURCES,
} from "./catalog.mjs";
import { ocrRequest } from "./ocr.mjs";
import {
  openAccessLink,
  openAccessEdition,
  openAccessFileChunk,
} from "./openaccess.mjs";
import { cachedSearch, store } from "./storage.mjs";
import { getContent } from "./content.mjs";
import { hindawiLink, hindawiEdition, hindawiFileChunk } from "./hindawi.mjs";
import { gallicaLink, gallicaBook } from "./gallica.mjs";
import { getReaderFileChunk } from "./reading.mjs";
import { diagnose } from "./source-policy.mjs";
import { sourceAudit } from "./source-audit.mjs";
import {
  standardBook,
  standardFileChunk,
  standardUrlPath,
} from "./standardebooks.mjs";
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "X-Content-Type-Options": "nosniff",
};
export default async function handler(request) {
  if (/\/(?:api|\.netlify\/functions\/api)\/ocr\/?$/.test(new URL(request.url).pathname)) return ocrRequest(request);
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
        { status: "ok", version: "1.3.0", time: new Date().toISOString() },
        { headers },
      );
    if (path === "/sources")
      return Response.json(
        {
          sources: sourceDirectory.map((s) => ({
            ...s,
            audit: sourceAudit(s.id),
          })),
        },
        { headers },
      );
    if (path === "/import-collection") {
      const link = url.searchParams.get("url") || "";
      const source = url.searchParams.get("source");
      if (!["hindawi", "gallica"].includes(source))
        throw new Error("Invalid collection source");
      const edition =
        source === "hindawi"
          ? await hindawiEdition(hindawiLink(link))
          : gallicaBook(gallicaLink(link));
      return Response.json({ book: edition.book }, { headers });
    }
    if (path === "/import-standard") {
      const { book } = await standardBook(
        standardUrlPath(url.searchParams.get("url") || ""),
      );
      return Response.json({ book }, { headers });
    }
    if (path === "/import-openaccess") {
      const { source, id } = openAccessLink(url.searchParams.get("url") || "");
      return Response.json(
        { book: (await openAccessEdition(source, id)).book },
        { headers },
      );
    }
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
      if (
        options.source === "all" &&
        options.excluded?.length === SOURCES.length
      )
        return Response.json(
          {
            error:
              "All connected libraries are disabled. Enable a source or choose a specific library.",
          },
          { status: 400, headers },
        );
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
      const data = await getContent(url.searchParams.get("id") || "", {
        language: url.searchParams.get("language") || "en",
        chapter: url.searchParams.get("chapter") || undefined,
        format: url.searchParams.get("format") || "auto",
      });
      return Response.json(data, {
        headers: {
          ...headers,
          "Cache-Control":
            data.type === "source" ? "no-store" : "public, max-age=300",
        },
      });
    }
    if (path === "/file") {
      const data =
        url.searchParams.get("source") === "hindawi"
          ? await hindawiFileChunk(
              url.searchParams.get("id") || "",
              Number(url.searchParams.get("start")),
              Number(url.searchParams.get("end")),
            )
          : ["oapen", "doab"].includes(url.searchParams.get("source"))
            ? await openAccessFileChunk(
                url.searchParams.get("source"),
                url.searchParams.get("id") || "",
                url.searchParams.get("format") || "pdf",
                Number(url.searchParams.get("start")),
                Number(url.searchParams.get("end")),
              )
            : url.searchParams.get("source") === "standardebooks"
              ? await standardFileChunk(
                  url.searchParams.get("id") || "",
                  Number(url.searchParams.get("start")),
                  Number(url.searchParams.get("end")),
                )
              : await getReaderFileChunk(
                  url.searchParams.get("id") || "",
                  url.searchParams.get("name") || "",
                  Number(url.searchParams.get("start")),
                  Number(url.searchParams.get("end")),
                );
      return new Response(data.bytes, {
        headers: {
          ...headers,
          "Content-Type": "application/octet-stream",
          "X-Book-Length": String(data.size),
          "Access-Control-Expose-Headers": "X-Book-Length",
          "Cache-Control": "public, max-age=60",
        },
      });
    }
    return Response.json({ error: "Not found" }, { status: 404, headers });
  } catch (error) {
    console.error("API request failed:", error.message);
    return Response.json(
      {
        code: diagnose(error).code,
        error:
          path === "/content" ||
          path === "/file" ||
          path === "/import-collection" ||
          path === "/import-standard" ||
          path === "/import-openaccess"
            ? diagnose(error).message
            : "The catalogue is temporarily unavailable. Please try again.",
      },
      {
        status: [401, 403, 429].includes(error.status)
          ? error.status
          : (path === "/import-collection" &&
                error.message.startsWith("Invalid ")) ||
              (path === "/import-openaccess" &&
                error.message === "Invalid open-access book link") ||
              (path === "/content" &&
                [
                  "Unsupported book identifier",
                  "Invalid reader format",
                  "Invalid Standard Ebooks edition",
                ].includes(error.message)) ||
              (path === "/import-standard" &&
                [
                  "Invalid URL",
                  "Invalid Standard Ebooks edition",
                  "Paste an individual Standard Ebooks book page URL.",
                ].includes(error.message)) ||
              (path === "/file" &&
                [
                  "Invalid reader file range",
                  "Invalid open-access edition",
                ].includes(error.message))
            ? 400
            : path === "/file" &&
                error.message === "No publicly accessible reader file"
              ? 404
              : error.status === 404
                ? 404
                : 502,
        headers: { ...headers, "Cache-Control": "no-store" },
      },
    );
  }
}
