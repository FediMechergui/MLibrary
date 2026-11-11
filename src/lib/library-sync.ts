import type { AppState } from "../types";
import { API } from "./api";

const maps = ["shelf", "marks", "sources"] as const;
const fields = ["language", "dailyGoal", "settings", "preferences"] as const;
const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
const base64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
export function deviceId() {
  let id = localStorage.getItem("mlibrary:device");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("mlibrary:device", id);
  }
  return id;
}
export function stampChanges(previous: AppState, value: AppState): AppState {
  if (value === previous) return previous;
  // Preserve React object identity for unchanged books/settings. Deep-cloning
  // the shelf here restarts an open EPUB on every progress update.
  const next = {
    ...value,
    sync: {
      clocks: { ...value.sync?.clocks },
      activity: { ...value.sync?.activity },
    },
  };
  const device = deviceId();
  const at = Math.max(
    Date.now(),
    ...Object.values(previous.sync?.clocks || {}).map((c) => c.at + 1),
  );
  for (const map of maps)
    for (const id of new Set([
      ...Object.keys(previous[map]),
      ...Object.keys(next[map]),
    ])) {
      if (JSON.stringify(previous[map][id]) !== JSON.stringify(next[map][id]))
        next.sync.clocks[`${map}:${id}`] = { at, device };
    }
  for (const field of fields)
    if (JSON.stringify(previous[field]) !== JSON.stringify(next[field]))
      next.sync.clocks[field] = { at, device };
  for (const [day, seconds] of Object.entries(next.activity)) {
    const counters = (next.sync.activity[day] = {
      ...(next.sync.activity[day] || { legacy: previous.activity[day] || 0 }),
    });
    const delta = seconds - (previous.activity[day] || 0);
    if (delta > 0) counters[device] = (counters[device] || 0) + delta;
  }
  return next;
}
export function mergeLibraries(local: AppState, remote: AppState): AppState {
  const next = structuredClone(local);
  next.sync = {
    clocks: { ...local.sync?.clocks },
    activity: structuredClone(local.sync?.activity || {}),
  };
  const fallback = (state: AppState, key: string) => {
    if (state.sync?.clocks[key]) return state.sync.clocks[key];
    if (key.startsWith("shelf:")) {
      const e = state.shelf[key.slice(6)];
      return { at: e?.progress?.updatedAt || e?.addedAt || 0, device: "" };
    }
    return {
      at: key.startsWith("marks:")
        ? state.marks[key.slice(6)]?.createdAt || 0
        : 0,
      device: "",
    };
  };
  const keys = new Set([
    ...Object.keys(local.sync?.clocks || {}),
    ...Object.keys(remote.sync?.clocks || {}),
    ...fields,
  ]);
  for (const map of maps)
    for (const id of new Set([
      ...Object.keys(local[map]),
      ...Object.keys(remote[map]),
    ]))
      keys.add(`${map}:${id}`);
  for (const key of keys) {
    const a = fallback(local, key),
      b = fallback(remote, key);
    if (b.at < a.at || (b.at === a.at && b.device <= a.device)) continue;
    next.sync.clocks[key] = b;
    const map = maps.find((m) => key.startsWith(m + ":"));
    if (map) {
      const id = key.slice(map.length + 1);
      const source = remote[map] as Record<string, unknown>,
        target = next[map] as Record<string, unknown>;
      if (Object.hasOwn(source, id)) target[id] = structuredClone(source[id]);
      else delete target[id];
    } else if (fields.includes(key as (typeof fields)[number]))
      Object.assign(next, {
        [key]: structuredClone(remote[key as (typeof fields)[number]]),
      });
  }
  // Per-device grow-only counters merge without double-counting repeated syncs.
  for (const day of new Set([
    ...Object.keys(local.activity),
    ...Object.keys(remote.activity),
  ])) {
    const a = local.sync?.activity[day] || { legacy: local.activity[day] || 0 };
    const b = remote.sync?.activity[day] || {
      legacy: remote.activity[day] || 0,
    };
    const counters: Record<string, number> = {};
    for (const id of new Set([...Object.keys(a), ...Object.keys(b)]))
      counters[id] = Math.max(a[id] || 0, b[id] || 0);
    next.sync.activity[day] = counters;
    next.activity[day] = Object.values(counters).reduce((a, b) => a + b, 0);
  }
  // Download flags describe this device; encrypted sync contains no book files.
  for (const [id, entry] of Object.entries(next.shelf)) {
    entry.offline = local.shelf[id]?.offline || false;
    if (JSON.stringify(entry.book) === JSON.stringify(local.shelf[id]?.book))
      entry.book = local.shelf[id].book;
    if (JSON.stringify(entry) === JSON.stringify(local.shelf[id]))
      next.shelf[id] = local.shelf[id];
  }
  for (const field of fields)
    if (JSON.stringify(next[field]) === JSON.stringify(local[field]))
      Object.assign(next, { [field]: local[field] });
  return next;
}
export function newSyncKey() {
  return "ML1-" + base64(crypto.getRandomValues(new Uint8Array(32)));
}
async function credentials(recovery: string) {
  if (!/^ML1-[\w-]{43}$/.test(recovery))
    throw new Error("Enter the complete recovery key beginning ML1-.");
  const raw = Uint8Array.from(
    atob(recovery.slice(4).replaceAll("-", "+").replaceAll("_", "/") + "="),
    (c) => c.charCodeAt(0),
  );
  if (base64(raw) !== recovery.slice(4))
    throw new Error(
      "The recovery key is not valid. Copy the complete original key.",
    );
  const material = await crypto.subtle.importKey("raw", raw, "HKDF", false, [
    "deriveBits",
  ]);
  const derive = (info: string) =>
    crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: encoder.encode("MLibrary sync v1"),
        info: encoder.encode(info),
      },
      material,
      256,
    );
  const token = base64(new Uint8Array(await derive("authentication")));
  const id = hex(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
  const key = await crypto.subtle.importKey(
    "raw",
    await derive("encryption"),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
  return { token, id, key };
}
export async function encryptLibrary(state: AppState, recovery: string) {
  const { key, id } = await credentials(recovery);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = encoder.encode(JSON.stringify(state));
  if (plain.length > 2 * 1024 * 1024 - 32)
    throw new Error(
      "Sync supports 2 MiB of library notes. Use a backup for larger libraries or quote images.",
    );
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(id) },
    key,
    plain,
  );
  const result = new Uint8Array(16 + cipher.byteLength);
  result.set(encoder.encode("MLV1"));
  result.set(iv, 4);
  result.set(new Uint8Array(cipher), 16);
  return result;
}
export async function decryptLibrary(bytes: ArrayBuffer, recovery: string) {
  const { key, id } = await credentials(recovery);
  if (
    bytes.byteLength > 2 * 1024 * 1024 ||
    new TextDecoder().decode(bytes.slice(0, 4)) !== "MLV1"
  )
    throw new Error("Invalid encrypted library");
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes.slice(4, 16),
        additionalData: encoder.encode(id),
      },
      key,
      bytes.slice(16),
    );
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain));
  } catch {
    throw new Error(
      "This library could not be decrypted. Check your recovery key.",
    );
  }
}
export async function pullLibrary(
  recovery: string,
): Promise<{ state: unknown; etag: string } | null> {
  const { token, id } = await credentials(recovery);
  const response = await fetch(`${API}/api/vault/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error("Sync is unavailable. Your local library is safe.");
  const etag =
    response.headers.get("x-vault-revision") || response.headers.get("etag");
  if (!etag) throw new Error("Sync revision missing. Please try again.");
  return {
    state: await decryptLibrary(await response.arrayBuffer(), recovery),
    etag,
  };
}
export async function pushLibrary(
  state: AppState,
  recovery: string,
  etag?: string,
) {
  const { token, id } = await credentials(recovery);
  const response = await fetch(`${API}/api/vault/${id}`, {
    method: "PUT",
    signal: AbortSignal.timeout(30000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "X-Vault-Revision": etag || "new",
    },
    body: await encryptLibrary(state, recovery),
  });
  if (response.status === 409) return false;
  if (!response.ok)
    throw new Error(
      response.status === 413
        ? "Sync storage is full. Export a backup instead."
        : "Sync failed. Your local library is safe.",
    );
  return true;
}
export async function deleteVault(recovery: string) {
  const { token, id } = await credentials(recovery);
  const response = await fetch(`${API}/api/vault/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error("Could not delete the cloud copy. Try again.");
}
