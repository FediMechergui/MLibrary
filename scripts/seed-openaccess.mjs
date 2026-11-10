import {
  downloadOpenAccessSnapshot,
  OPENACCESS_FEED,
} from "../server/openaccess-feed.mjs";
import { gzipSync } from "node:zlib";
import { readFile, writeFile, rename } from "node:fs/promises";

// A single official CC0 metadata export, never a book-page crawl.
const source = OPENACCESS_FEED;
let snapshot;
if (process.argv.includes("--prepared")) {
  snapshot = JSON.parse(await readFile(".cache/doab-seed-rows.json", "utf8"));
} else {
  snapshot = await downloadOpenAccessSnapshot(180000);
}
if (snapshot.source !== source || snapshot.rows.length < 30000)
  throw new Error("Incomplete feed; keeping previous snapshot");
snapshot.rows = snapshot.rows.map((row) =>
  row.map((value, i) =>
    typeof value === "string" ? value.slice(0, i === 5 ? 400 : 2000) : value,
  ),
);
const target = "server/data/openaccess.json.gz";
await writeFile(`${target}.tmp`, gzipSync(JSON.stringify(snapshot)));
await rename(`${target}.tmp`, target);
console.log(
  JSON.stringify({
    records: snapshot.rows.length,
    updatedAt: snapshot.updatedAt,
    languages: Object.fromEntries(
      ["en", "fr", "ar"].map((language) => [
        language,
        snapshot.rows.filter((row) => row[3].includes(language)).length,
      ]),
    ),
  }),
);
