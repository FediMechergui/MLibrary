import JSZip from "jszip";
import { getMany, setMany, delMany } from "idb-keyval";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { AppState, BookContent } from "../types";
import { defaults, offlineBook } from "./state";
import { mergeLibraries } from "./library-sync";

const MiB = 1024 * 1024,
  MAX = 250 * MiB;
const badKeys = new Set(["__proto__", "prototype", "constructor"]);
function assert(ok: unknown, message = "Invalid library backup"): asserts ok {
  if (!ok) throw new Error(message);
}
function safeObject(value: unknown, depth = 0): void {
  assert(depth < 24);
  if (typeof value === "number")
    assert(
      Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER,
    );
  if (typeof value === "string") assert(value.length <= 2 * MiB);
  if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) {
      assert(!badKeys.has(key) && key.length < 1000);
      safeObject(item, depth + 1);
    }
}
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown) =>
  Array.isArray(v) &&
  v.length <= 1000 &&
  v.every((s) => typeof s === "string" && s.length < 20000);
const url = (v: unknown) =>
  typeof v === "string" && (!v || /^https?:\/\//i.test(v));
function book(v: any) {
  assert(
    object(v) &&
      typeof v.id === "string" &&
      v.id.length < 1000 &&
      !badKeys.has(v.id),
  );
  assert(
    typeof v.title === "string" &&
      v.title.length <= 20000 &&
      strings(v.authors) &&
      strings(v.languages) &&
      strings(v.subjects) &&
      strings(v.formats),
  );
  assert(
    typeof v.language === "string" &&
      typeof v.source === "string" &&
      typeof v.description === "string" &&
      typeof v.rights === "string",
  );
  assert(["read", "borrow", "source"].includes(v.access) && url(v.sourceUrl));
  if (v.cover && !url(v.cover)) v.cover = null;
}
export function validateLibrary(value: unknown): AppState {
  assert(
    object(value) &&
      value.version === 1 &&
      JSON.stringify(value).length <= 8 * MiB,
  );
  safeObject(value);
  const v = structuredClone(value);
  assert(
    ["en", "fr", "ar"].includes(v.language) &&
      object(v.shelf) &&
      object(v.activity),
  );
  assert(
    Object.keys(v.shelf).length <= 10000 &&
      Object.keys(v.marks || {}).length <= 20000,
  );
  for (const [id, e] of Object.entries(v.shelf) as [string, any][]) {
    book(e.book);
    assert(
      e.book.id === id &&
        Number.isFinite(e.addedAt) &&
        ["want", "reading", "finished"].includes(e.status) &&
        Array.isArray(e.bookmarks),
    );
    assert(e.tags === undefined || strings(e.tags));
    for (const mark of e.bookmarks)
      assert(
        object(mark) &&
          typeof mark.id === "string" &&
          Number.isFinite(mark.position) &&
          typeof mark.label === "string",
      );
    if (e.progress)
      assert(
        object(e.progress) &&
          ["position", "total", "percent", "updatedAt"].every((k) =>
            Number.isFinite(e.progress[k]),
          ),
      );
    e.offline = false;
  }
  assert(object(v.marks || {}));
  for (const [id, mark] of Object.entries(v.marks || {}) as [string, any][]) {
    book(mark.book);
    assert(
      mark.id === id &&
        typeof mark.text === "string" &&
        typeof mark.note === "string" &&
        strings(mark.tags) &&
        Number.isFinite(mark.createdAt),
    );
    assert(
      object(mark.anchor) &&
        ["text", "pdf", "epub", "source"].includes(mark.anchor.type) &&
        Number.isFinite(mark.anchor.page),
    );
    assert(["honey", "sage", "rose", "sky"].includes(mark.color));
    if (mark.cardDesign) {
      const d = mark.cardDesign;
      assert(
        object(d) &&
          ["story", "square", "portrait", "landscape"].includes(d.format) &&
          ["editorial", "centered", "minimal", "poster"].includes(d.layout) &&
          ["serif", "sans"].includes(d.font) &&
          ["start", "center", "end"].includes(d.align),
      );
      assert(
        ["fontSize", "lineHeight", "padding", "imageShade"].every((k) =>
          Number.isFinite(d[k]),
        ),
      );
      assert(
        ["background", "foreground", "accent"].every(
          (k) => typeof d[k] === "string" && /^#[a-f\d]{6}$/i.test(d[k]),
        ),
      );
      assert(
        d.fontSize >= 10 &&
          d.fontSize <= 200 &&
          d.lineHeight >= 0.5 &&
          d.lineHeight <= 4 &&
          d.padding >= 0 &&
          d.padding <= 300 &&
          d.imageShade >= 0 &&
          d.imageShade <= 1,
      );
    }
    if (
      mark.cardDesign?.backgroundImage &&
      !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
        mark.cardDesign.backgroundImage,
      )
    )
      delete mark.cardDesign.backgroundImage;
  }
  for (const [day, seconds] of Object.entries(v.activity))
    assert(
      /^\d{4}-\d{2}-\d{2}$/.test(day) &&
        typeof seconds === "number" &&
        seconds >= 0,
    );
  const s = { ...defaults.settings, ...v.settings };
  assert(
    ["paper", "sepia", "night"].includes(s.theme) &&
      ["flip", "page", "scroll"].includes(s.mode) &&
      ["serif", "sans"].includes(s.font),
  );
  assert(
    Number.isFinite(s.fontSize) &&
      s.fontSize >= 10 &&
      s.fontSize <= 80 &&
      Number.isFinite(s.lineHeight) &&
      s.lineHeight >= 1 &&
      s.lineHeight <= 4,
  );
  assert(
    Number.isFinite(v.dailyGoal) && v.dailyGoal >= 1 && v.dailyGoal <= 1440,
  );
  const p = { ...defaults.preferences, ...v.preferences };
  assert(
    strings(p.genres) &&
      strings(p.purposes) &&
      strings(p.languages) &&
      p.languages.every((l: string) => ["en", "fr", "ar"].includes(l)),
  );
  assert(object(v.sources || {}));
  for (const pref of Object.values(v.sources || {}) as any[])
    assert(
      object(pref) &&
        (!pref.format || ["auto", "text", "epub", "pdf"].includes(pref.format)),
    );
  if (v.sync) {
    assert(
      object(v.sync.clocks) &&
        object(v.sync.activity) &&
        Object.keys(v.sync.clocks).length <= 50000,
    );
    for (const [key, c] of Object.entries(v.sync.clocks) as [string, any][])
      assert(
        /^(?:shelf:|marks:|sources:|language$|dailyGoal$|settings$|preferences$)/.test(
          key,
        ) &&
          object(c) &&
          Number.isFinite(c.at) &&
          c.at >= 0 &&
          c.at < Date.now() + 86400000 &&
          typeof c.device === "string",
      );
    for (const counters of Object.values(v.sync.activity)) {
      assert(object(counters));
      for (const n of Object.values(counters))
        assert(typeof n === "number" && n >= 0);
    }
  }
  return {
    ...defaults,
    ...v,
    settings: s,
    preferences: p,
    marks: v.marks || {},
    sources: v.sources || {},
  } as AppState;
}
async function digest(bytes: ArrayBuffer) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
type Asset = {
  id: string;
  path: string;
  hash: string;
  size: number;
  type: "pdf" | "epub" | "text";
  attribution?: string;
  sourceUrl?: string;
};
export type PreparedBackup = {
  state: AppState;
  files: Map<string, BookContent>;
  savedAt?: string;
};
export async function createBackup(
  state: AppState,
  includeBooks: boolean,
  progress: (message: string) => void,
) {
  const zip = new JSZip(),
    files: Asset[] = [];
  let total = 0;
  if (includeBooks)
    for (const [id, entry] of Object.entries(state.shelf)) {
      progress(entry.book.title);
      const content = await offlineBook(id);
      if (
        !content ||
        (content.type !== "text" &&
          content.type !== "pdf" &&
          content.type !== "epub")
      )
        continue;
      const data =
        content.type === "text"
          ? new TextEncoder().encode(JSON.stringify(content)).buffer
          : (content as { data: Blob | ArrayBuffer }).data;
      const bytes = data instanceof Blob ? await data.arrayBuffer() : data;
      total += bytes.byteLength;
      assert(
        total <= MAX && bytes.byteLength <= 50 * MiB,
        "This backup exceeds 250 MiB. Export notes only or remove some offline downloads first.",
      );
      const hash = await digest(bytes),
        path = `books/${hash}.bin`;
      zip.file(path, bytes);
      files.push({
        id,
        path,
        hash,
        size: bytes.byteLength,
        type: content.type as Asset["type"],
        attribution: content.attribution,
        sourceUrl: content.sourceUrl,
      });
    }
  zip.file(
    "library.json",
    JSON.stringify({
      format: "mlibrary-backup",
      version: 1,
      savedAt: new Date().toISOString(),
      state,
      files,
    }),
  );
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}
// Bound actual decompressed bytes, including ZIPs whose declared sizes are false.
async function readEntry(
  entry: JSZip.JSZipObject,
  maximum: number,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0,
      failed = false;
    const stream = (
      entry as JSZip.JSZipObject & {
        internalStream(type: string): JSZip.JSZipStreamHelper<Uint8Array>;
      }
    ).internalStream("uint8array");
    stream.on("data", (chunk: Uint8Array) => {
      size += chunk.length;
      if (size > maximum) {
        failed = true;
        stream.pause();
        reject(new Error("Backup file is too large"));
      } else chunks.push(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => {
      if (failed) return;
      const out = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(out.buffer);
    });
    stream.resume();
  });
}
export async function inspectBackup(file: File): Promise<PreparedBackup> {
  assert(file.size <= MAX + 8 * MiB, "Backup is larger than 258 MiB");
  if (file.name.toLowerCase().endsWith(".json")) {
    assert(file.size <= 8 * MiB);
    return {
      state: validateLibrary(JSON.parse(await file.text())),
      files: new Map(),
    };
  }
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  assert(Object.keys(zip.files).length <= 10002 && zip.file("library.json"));
  for (const entry of Object.values(zip.files))
    assert(
      !entry.unsafeOriginalName || entry.unsafeOriginalName === entry.name,
      "Unsafe backup path",
    );
  const manifest = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      await readEntry(zip.file("library.json")!, 8 * MiB),
    ),
  );
  assert(
    manifest.format === "mlibrary-backup" &&
      manifest.version === 1 &&
      Array.isArray(manifest.files) &&
      manifest.files.length <= 10000,
  );
  const state = validateLibrary(manifest.state),
    files = new Map<string, BookContent>();
  let total = 0;
  for (const asset of manifest.files as Asset[]) {
    assert(
      state.shelf[asset.id] &&
        !files.has(asset.id) &&
        /^[a-f0-9]{64}$/.test(asset.hash) &&
        asset.path === `books/${asset.hash}.bin` &&
        ["pdf", "epub", "text"].includes(asset.type),
    );
    assert(
      Number.isInteger(asset.size) &&
        asset.size > 0 &&
        asset.size <= 50 * MiB &&
        (total += asset.size) <= MAX,
    );
    const entry = zip.file(asset.path);
    assert(entry, "A book file is missing");
    const bytes = await readEntry(entry, asset.size);
    assert(
      bytes.byteLength === asset.size && (await digest(bytes)) === asset.hash,
      "A book file is damaged",
    );
    let content: BookContent;
    if (asset.type === "text") {
      content = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
      assert(
        content.type === "text" &&
          typeof content.text === "string" &&
          Array.isArray(content.chapters) &&
          content.chapters.every(
            (c) => typeof c.title === "string" && url(c.url),
          ),
      );
      if (content.sections)
        assert(
          object(content.sections) &&
            Object.entries(content.sections).every(
              ([id, text]) =>
                /^part-[1-9]\d{0,3}$/.test(id) && typeof text === "string",
            ),
        );
    } else {
      const prefix = new Uint8Array(bytes.slice(0, 5));
      assert(
        asset.type === "pdf"
          ? new TextDecoder().decode(prefix) === "%PDF-"
          : prefix[0] === 0x50 && prefix[1] === 0x4b,
        "Invalid book file",
      );
      content = {
        type: asset.type,
        data: bytes,
        attribution:
          typeof asset.attribution === "string" ? asset.attribution : "",
        sourceUrl: url(asset.sourceUrl) ? asset.sourceUrl : "",
      };
    }
    files.set(asset.id, content);
  }
  return { state, files, savedAt: manifest.savedAt };
}
export async function restoreBackup(
  prepared: PreparedBackup,
  current: AppState,
) {
  const next = mergeLibraries(current, prepared.state);
  for (const id of prepared.files.keys())
    if (next.shelf[id]) next.shelf[id].offline = true;
  // IDB writes are one transaction; roll them back if metadata storage is full.
  const keys = [...prepared.files.keys()].map((id) => `book:${id}`),
    previous = await getMany(keys);
  await setMany(
    [...prepared.files].map(([id, content]) => [`book:${id}`, content]),
  );
  try {
    localStorage.setItem("mlibrary:v1", JSON.stringify(next));
  } catch (error) {
    await setMany(
      keys.flatMap((key, i) =>
        previous[i] === undefined
          ? []
          : [[key, previous[i]] as [string, BookContent]],
      ),
    );
    await delMany(keys.filter((_, i) => previous[i] === undefined));
    throw error;
  }
  return next;
}
export async function shareBackup(blob: Blob) {
  const name = `MLibrary-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  if (Capacitor.isNativePlatform()) {
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const { uri } = await Filesystem.writeFile({
      path: `backups/${name}`,
      directory: Directory.Cache,
      data,
      recursive: true,
    });
    await Share.share({
      title: name,
      files: [uri],
      dialogTitle: "Save your library backup",
    });
  } else {
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
