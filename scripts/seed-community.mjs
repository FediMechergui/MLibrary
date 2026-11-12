import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { parseHTML } from "linkedom";
import {
  parseUnglue,
  parseFadedList,
  parseGreyList,
  origins,
} from "../server/community-parsers.mjs";

// Public metadata only. One request at a time, paced and resumable; never bulk book files.
mkdirSync(".cache/community-metadata", { recursive: true });
const output = "server/data/community.json.gz";
const previous = existsSync(output)
  ? JSON.parse(gunzipSync(readFileSync(output)))
  : { records: [], cursor: 0 };
const records = new Map(previous.records.map((b) => [b.id, b]));
let requests = 0;
async function get(url, body) {
  const path = `.cache/community-metadata/${createHash("sha256")
    .update(url + (body || ""))
    .digest("hex")}.txt`;
  if (process.argv.includes("--resume") && existsSync(path))
    return readFileSync(path, "utf8");
  await new Promise((resolve) => setTimeout(resolve, 650));
  let s;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(45000),
        headers: {
          "User-Agent":
            "MLibrary catalogue (+https://github.com/FediMechergui/MLibrary)",
        },
        ...(body ? { method: "POST", body: new URLSearchParams(body) } : {}),
      });
      if (!r.ok) {
        await r.body?.cancel();
        throw Object.assign(
          new Error(`${new URL(url).hostname}: HTTP ${r.status}`),
          { status: r.status },
        );
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of r.body) {
        size += chunk.length;
        if (size > 12 * 1024 * 1024)
          throw new Error("Metadata response too large");
        chunks.push(chunk);
      }
      s = Buffer.concat(chunks).toString("utf8");
      break;
    } catch (error) {
      if (
        attempt ||
        [401, 403, 404, 429].includes(error.status) ||
        !(
          error instanceof TypeError ||
          error.name === "TimeoutError" ||
          error.status >= 500
        )
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  writeFileSync(path, s);
  requests++;
  return s;
}
const add = (items) => items.forEach((b) => records.set(b.id, b));
const report = {};
function save() {
  report.unglue ||= { records: 0, complete: false, nextPage: previous.cursor };
  report.unglue.records = [...records.values()].filter(
    (b) => b.source === "unglue",
  ).length;
  report.unglue.nextPage = previous.cursor;
  writeFileSync(
    output,
    gzipSync(
      JSON.stringify({
        updatedAt: new Date().toISOString(),
        cursor: previous.cursor,
        report,
        records: [...records.values()],
      }),
      { level: 9 },
    ),
  );
}
// Faded Page's public all-books table is complete. Its own search supplies the language facets.
const first = parseFadedList(await get(`${origins.fadedpage}/allbooks.php`));
const faded = new Map(first.records.map((b) => [b.id, b]));
for (const url of first.pages.filter(
  (u) => !new URL(u).searchParams.get("range")?.match(/^0$/),
)) {
  for (const b of parseFadedList(await get(url)).records) faded.set(b.id, b);
}
const en = JSON.parse(
  await get(`${origins.fadedpage}/csearc2.php`, "plang=en"),
);
const languages = Object.keys(en.langmap || {}).filter((l) => l !== "en");
if (!languages.includes("fr"))
  throw new Error("Faded Page language facets missing");
for (const language of languages) {
  const data = JSON.parse(
    await get(`${origins.fadedpage}/csearc2.php`, `plang=${language}`),
  );
  if (data.nrows > data.rows.length)
    throw new Error(`Faded Page ${language} metadata truncated`);
  for (const r of data.rows) {
    const b = faded.get(`fadedpage:${r.pid}`);
    if (b) {
      b.language = language;
      b.languages = [language];
    }
  }
}
for (const b of faded.values())
  if (!b.language) {
    b.language = "en";
    b.languages = ["en"];
  }
if ([...faded.values()].filter((b) => b.language === "en").length !== en.nrows)
  throw new Error(
    "Faded Page language totals changed; retain previous snapshot and retry",
  );
for (const b of en.rows) {
  const r = faded.get(`fadedpage:${b.pid}`);
  if (r && b.cover) r.cover = new URL(b.cover, origins.fadedpage).href;
}
const supported = [...faded.values()].filter((b) =>
  ["en", "fr", "ar"].includes(b.language),
);
if (supported.length < 1000) throw new Error("Incomplete Faded Page catalogue");
for (const [id, b] of records) if (b.source === "fadedpage") records.delete(id);
add(supported);
report.fadedpage = { records: supported.length, complete: true };
save();
console.log("Faded Page", report.fadedpage);

const { document: d } = parseHTML(
  await get(`${origins.globalgrey}/ebook-categories.html`),
);
const roots = [...d.querySelectorAll(".cat-card .cat-links a:first-child")].map(
  (a) => a.getAttribute("href"),
);
if (roots.length < 10) throw new Error("Global Grey category listing changed");
const grey = new Map(),
  visited = new Set();
for (const root of roots) {
  let next = root;
  while (next) {
    const u = new URL(next);
    if (
      u.origin !== origins.globalgrey ||
      !/^\/category\/ebooks\/[a-z0-9-]+\.html$/.test(u.pathname) ||
      visited.has(next)
    )
      break;
    if (visited.size >= 300) throw new Error("Global Grey pagination limit");
    visited.add(next);
    const result = parseGreyList(await get(next));
    if (!result.records.length)
      throw new Error("Global Grey catalogue markup changed");
    for (const b of result.records) grey.set(b.id, b);
    next = result.next;
  }
  console.log("Global Grey categories", visited.size, "records", grey.size);
}
for (const [id, b] of records)
  if (b.source === "globalgrey") records.delete(id);
add([...grey.values()]);
report.globalgrey = { records: grey.size, pages: visited.size, complete: true };
save();

// Unglue.it has 10 records per OPDS page. Extend a bounded snapshot every refresh,
// and revisit its newest pages. Excluding Gutenberg/DOAB reduces duplicate editions.
let nextPage = previous.cursor || 0,
  completed = false;
const pageBudget = Math.max(
  1,
  Math.min(
    80,
    Number(process.argv.find((a) => a.startsWith("--pages="))?.split("=")[1]) ||
      80,
  ),
);
const pages = [
  ...new Set([
    0,
    1,
    2,
    3,
    4,
    ...Array.from({ length: pageBudget }, (_, i) => nextPage + i),
  ]),
];
for (const page of pages) {
  const data = parseUnglue(
    await get(`${origins.unglue}/api/opds/epub/-gtbg/-doab/?page=${page}`),
  );
  add(data.records);
  if (page >= nextPage) previous.cursor = page + 1;
  if (!data.next) {
    completed = true;
    previous.cursor = 0;
    break;
  }
  if (page % 10 === 0) {
    save();
    console.log("Unglue.it page", page);
  }
}
report.unglue = {
  records: [...records.values()].filter((b) => b.source === "unglue").length,
  complete: completed,
  nextPage: previous.cursor,
};
save();
console.log(JSON.stringify({ report, requests, records: records.size }));
