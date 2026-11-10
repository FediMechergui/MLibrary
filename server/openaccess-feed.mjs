import { Readable } from "node:stream";
import { parse } from "csv-parse";
export const OPENACCESS_FEED = "https://memo.doabooks.org/file/oapen/DOAB.csv";
export async function downloadOpenAccessSnapshot(timeoutMs = 22000) {
  const response = await fetch(OPENACCESS_FEED, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent": "MLibrary/1.0 (https://github.com/FediMechergui/MLibrary)",
    },
  });
  if (!response.ok) throw new Error(`DOAB export returned ${response.status}`);
  let bytes = 0;
  const bounded = async function* () {
    for await (const chunk of Readable.fromWeb(response.body)) {
      bytes += chunk.length;
      if (bytes > 512 * 1024 * 1024)
        throw new Error("Metadata export exceeds limit");
      yield chunk;
    }
  };
  const rows = [];
  const incoming = Readable.from(bounded());
  const parser = parse({
    columns: (columns) => {
      if (
        ![
          "dc.type",
          "dc.title",
          "dc.language",
          "dc.identifier.uri",
          "BITSTREAM_Download_URL",
        ].every((name) => columns.includes(name))
      )
        throw new Error("Incomplete metadata columns");
      return columns;
    },
    skip_empty_lines: true,
    bom: true,
    max_record_size: 1000000,
  });
  incoming.on("error", (error) => parser.destroy(error));
  parser.on("close", () => incoming.destroy());
  incoming.pipe(parser);
  for await (const row of parser) {
    if (row["dc.type"] !== "book") continue;
    const languages = (row["dc.language"] || "")
      .split(";")
      .map(
        (code) =>
          ({
            eng: "en",
            en: "en",
            fra: "fr",
            fre: "fr",
            fr: "fr",
            ara: "ar",
            ar: "ar",
          })[code.trim()],
      )
      .filter(Boolean);
    const id = /\/handle\/20\.500\.12854\/(\d+)/.exec(
      row["dc.identifier.uri"] || "",
    )?.[1];
    if (!id || !languages.length || !row["dc.title"]) continue;
    rows.push([
      id,
      row["dc.title"],
      row["dc.contributor.author"] || row["dc.contributor.editor"] || "",
      languages,
      row["dc.subject.other"] || "",
      (row["dc.description.abstract"] || "").slice(0, 400),
      row.BITSTREAM_License || "",
      row.BITSTREAM_Download_URL || "",
      row["dc.date.issued"] || "",
    ]);
  }
  const snapshot = {
    source: OPENACCESS_FEED,
    updatedAt: new Date().toISOString(),
    rows,
  };
  if (rows.length < 30000)
    throw new Error("Incomplete feed; keeping previous snapshot");
  snapshot.rows = rows.map((row) =>
    row.map((value, i) =>
      typeof value === "string" ? value.slice(0, i === 5 ? 400 : 2000) : value,
    ),
  );
  return snapshot;
}
