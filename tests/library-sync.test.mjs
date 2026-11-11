import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["src/lib/library-sync.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "isolate-sync",
      setup(builder) {
        builder.onResolve({ filter: /^\.\/api$/ }, () => ({
          path: "api",
          namespace: "fixture",
        }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: 'export const API = "";',
        }));
      },
    },
  ],
});
const {
  stampChanges,
  mergeLibraries,
  newSyncKey,
  encryptLibrary,
  decryptLibrary,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) || null,
  setItem: (key, value) => memory.set(key, value),
};
const state = () => ({
  version: 1,
  language: "en",
  shelf: {
    one: { addedAt: 1, book: { title: "Personal reading" }, offline: true },
  },
  marks: {},
  sources: {},
  activity: { "2026-11-10": 120 },
  dailyGoal: 20,
  settings: {},
  preferences: {},
});
test("progress stamping and unchanged cloud pulls preserve the active book identity", () => {
  const before = state();
  const after = stampChanges(before, {
    ...before,
    shelf: {
      ...before.shelf,
      one: {
        ...before.shelf.one,
        progress: { position: 1, total: 5, percent: 20, updatedAt: Date.now() },
      },
    },
  });
  assert.equal(after.shelf.one.book, before.shelf.one.book);
  assert.equal(after.settings, before.settings);
  assert.equal(
    mergeLibraries(after, structuredClone(after)).shelf.one.book,
    before.shelf.one.book,
  );
});
test("merge retains independent edits and deletion tombstones instead of resurrecting old shelves", () => {
  const base = state();
  memory.set("mlibrary:device", "A");
  const removed = stampChanges(base, { ...base, shelf: {} });
  memory.set("mlibrary:device", "B");
  const edited = stampChanges(base, {
    ...base,
    marks: { quote: { createdAt: 5, text: "Keep this note" } },
  });
  const merged = mergeLibraries(removed, edited);
  assert.equal(merged.shelf.one, undefined);
  assert.equal(merged.marks.quote.text, "Keep this note");
  assert.equal(mergeLibraries(merged, base).shelf.one, undefined);
  assert.deepEqual(mergeLibraries(merged, merged), merged);
});
test("reading time adds independent device contributions and stays stable on repeated sync", () => {
  const base = state(),
    day = "2026-11-10";
  memory.set("mlibrary:device", "A");
  const a = stampChanges(base, { ...base, activity: { [day]: 140 } });
  memory.set("mlibrary:device", "B");
  const b = stampChanges(base, { ...base, activity: { [day]: 150 } });
  const merged = mergeLibraries(a, b);
  assert.equal(merged.activity[day], 170);
  assert.equal(mergeLibraries(merged, b).activity[day], 170);
});
test("encryption authenticates content, uses fresh nonces and refuses a wrong recovery key", async () => {
  const key = newSyncKey(),
    value = state();
  const first = await encryptLibrary(value, key),
    second = await encryptLibrary(value, key);
  assert.notDeepEqual(first, second);
  assert.ok(!new TextDecoder().decode(first).includes("Personal reading"));
  assert.deepEqual(await decryptLibrary(first.buffer, key), value);
  await assert.rejects(decryptLibrary(first.buffer, newSyncKey()), /decrypted/);
  first[20] ^= 1;
  await assert.rejects(decryptLibrary(first.buffer, key), /decrypted/);
});
