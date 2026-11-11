import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
const memory = new Map();
export function store() {
  if (
    process.env.NETLIFY ||
    process.env.NETLIFY_BLOBS_CONTEXT ||
    globalThis.netlifyBlobsContext
  )
    // Lambda compatibility contexts do not expose the uncached edge endpoint.
    // Catalogue snapshots tolerate the default, at-most-60-second propagation.
    return getStore({ name: "mlibrary-catalog-v1" });
  return {
    async get(key) {
      return memory.get(key) ?? null;
    },
    async setJSON(key, value) {
      memory.set(key, structuredClone(value));
    },
    async set(key, value) {
      memory.set(key, value);
    },
  };
}
export function cacheKey(options) {
  return createHash("sha256")
    .update(JSON.stringify({ revision: 4, ...options }))
    .digest("hex");
}
export async function cachedSearch(options, fetcher) {
  const s = store(),
    fingerprint = cacheKey(options);
  // Bounded slots prevent arbitrary user queries from creating unbounded storage.
  const key = `search/${parseInt(fingerprint.slice(0, 8), 16) % 512}`;
  let previous;
  try {
    previous = await s.get(key, { type: "json" });
  } catch {
    /* Upstream still works when cache is unavailable. */
  }
  if (
    previous?.fingerprint === fingerprint &&
    Date.now() - previous.savedAt < 900000
  )
    return { ...previous.data, cached: true };
  const data = await fetcher(options);
  if (!data.sources.length && previous?.fingerprint === fingerprint)
    return { ...previous.data, stale: true, errors: data.errors };
  if (!data.errors.length) {
    try {
      await s.setJSON(key, { fingerprint, savedAt: Date.now(), data });
    } catch {
      /* Cache failure must not break reading. */
    }
  }
  return data;
}
