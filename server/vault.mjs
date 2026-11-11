import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";

const MAX_BYTES = 2 * 1024 * 1024;
const memory = new Map();
const buckets = new Map();
function store() {
  if (
    process.env.NETLIFY ||
    process.env.NETLIFY_BLOBS_CONTEXT ||
    globalThis.netlifyBlobsContext
  )
    return getStore({
      name: "mlibrary-private-vaults-v1",
      consistency: "strong",
    });
  return {
    async getWithMetadata(key) {
      return memory.get(key) || null;
    },
    async set(key, data, options) {
      const previous = memory.get(key);
      if (
        (options.onlyIfNew && previous) ||
        (options.onlyIfMatch && previous?.etag !== options.onlyIfMatch)
      )
        return { modified: false };
      const value = { data: data.slice(0), etag: randomUUID(), metadata: {} };
      memory.set(key, value);
      return { modified: true, etag: value.etag };
    },
    async delete(key) {
      memory.delete(key);
    },
  };
}
// Secrets arrive only in Authorization; encrypted manifests are never logged.
export async function vaultRequest(request, context = {}, storage = store) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, If-Match, If-None-Match",
    "Access-Control-Expose-Headers": "ETag",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const reply = (error, status) =>
    Response.json({ error }, { status, headers });
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (!["GET", "PUT", "DELETE"].includes(request.method))
    return reply("Method not allowed", 405);
  const id = new URL(request.url).pathname.match(
    /\/vault\/([a-f0-9]{64})$/,
  )?.[1];
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (
    !id ||
    !token ||
    !timingSafeEqual(
      Buffer.from(id, "hex"),
      createHash("sha256").update(token).digest(),
    )
  )
    return reply("Invalid sync key", 401);
  // An additional per-instance guard; provider limits remain the hard upper bound.
  const now = Date.now(),
    client = context.ip || "local";
  if (buckets.size > 4096)
    for (const [key, value] of buckets)
      if (now - value.start > 60000) buckets.delete(key);
  const bucket = buckets.get(client);
  if (!bucket && buckets.size >= 4096)
    return reply("Sync is busy. Try again in a minute.", 429);
  if (!bucket || now - bucket.start > 60000)
    buckets.set(client, { start: now, count: 1 });
  else if (++bucket.count > 90)
    return reply("Too many sync requests. Try again in a minute.", 429);
  try {
    const s = storage();
    if (request.method === "GET") {
      const value = await s.getWithMetadata(id, {
        type: "arrayBuffer",
        consistency: "strong",
      });
      if (!value) return reply("No backup exists for this key", 404);
      return new Response(value.data, {
        headers: {
          ...headers,
          "Content-Type": "application/octet-stream",
          ETag: value.etag,
        },
      });
    }
    if (request.method === "DELETE") {
      await s.delete(id);
      return new Response(null, { status: 204, headers });
    }
    const match = request.headers.get("if-match"),
      fresh = request.headers.get("if-none-match") === "*";
    if (
      (!match && !fresh) ||
      (match && fresh) ||
      (match && !/^[\w"-]{1,160}$/.test(match))
    )
      return reply("A sync revision is required", 428);
    if (request.headers.get("content-type") !== "application/octet-stream")
      return reply("Encrypted data required", 415);
    if (Number(request.headers.get("content-length")) > MAX_BYTES)
      return reply(
        "Sync storage is limited to 2 MiB. Export a backup instead.",
        413,
      );
    const chunks = [],
      reader = request.body?.getReader();
    let length = 0;
    if (!reader) return reply("Empty sync data", 400);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BYTES) {
        await reader.cancel();
        return reply(
          "Sync storage is limited to 2 MiB. Export a backup instead.",
          413,
        );
      }
      chunks.push(value);
    }
    const data = Buffer.concat(chunks);
    if (data.length < 32 || data.subarray(0, 4).toString() !== "MLV1")
      return reply("Invalid encrypted backup", 400);
    const result = await s.set(
      id,
      data,
      match ? { onlyIfMatch: match } : { onlyIfNew: true },
    );
    if (!result.modified)
      return reply("Another device synced. Merge and retry.", 409);
    return new Response(null, {
      status: 204,
      headers: { ...headers, ETag: result.etag },
    });
  } catch {
    return reply(
      "Sync storage is unavailable. Your local library is unchanged.",
      503,
    );
  }
}
