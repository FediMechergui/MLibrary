import type { HighlightColor, ReadingMark } from "../types";

export const highlightColors: Record<HighlightColor, string> = {
  honey: "#f3d582",
  sage: "#bbd6bd",
  rose: "#ebbdba",
  sky: "#b9d4e8",
};
export const normalizeTags = (value: string) =>
  [
    ...new Set(
      value
        .split(/[,،\n]/)
        .map((t) => t.trim().replace(/^#/, "").slice(0, 32))
        .filter(Boolean),
    ),
  ].slice(0, 12);
export function intersectMarks(
  marks: ReadingMark[],
  start: number,
  end: number,
) {
  const boundaries = new Set([start, end]);
  const relevant = marks.filter(
    (m) =>
      m.anchor.start !== undefined &&
      m.anchor.end !== undefined &&
      m.anchor.start < end &&
      m.anchor.end > start,
  );
  relevant.forEach((m) => {
    boundaries.add(Math.max(start, m.anchor.start!));
    boundaries.add(Math.min(end, m.anchor.end!));
  });
  const values = [...boundaries].sort((a, b) => a - b);
  return values.slice(0, -1).map((from, index) => ({
    start: from,
    end: values[index + 1],
    mark: [...relevant]
      .reverse()
      .find(
        (m) => m.anchor.start! <= from && m.anchor.end! >= values[index + 1],
      ),
  }));
}
export const locationLabel = (mark: ReadingMark) =>
  mark.anchor.chapter || `Page ${mark.anchor.page + 1}`;

export async function quoteImage(mark: ReadingMark): Promise<Blob> {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  const ctx = canvas.getContext("2d")!;
  const lines: string[] = [];
  const fontSize =
    mark.text.length > 700 ? 38 : mark.text.length > 320 ? 48 : 62;
  ctx.font = `${fontSize}px "Newsreader", "Noto Naskh Arabic", Georgia, serif`;
  for (const paragraph of mark.text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > 960 && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    lines.push(line);
  }
  const lineHeight = fontSize * 1.42;
  canvas.height = Math.max(1200, Math.ceil(440 + lines.length * lineHeight));
  const colors =
    mark.cardStyle === "forest"
      ? ["#173b32", "#f6f1e5", "#b9c9af"]
      : mark.cardStyle === "clay"
        ? ["#edd5c5", "#4d302b", "#93644e"]
        : ["#f6f1e5", "#253b32", "#7e816f"];
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = colors[2];
  ctx.lineWidth = 1;
  ctx.strokeRect(46, 46, 1108, canvas.height - 92);
  ctx.font = '150px "Newsreader", Georgia, serif';
  ctx.fillStyle = colors[2];
  ctx.fillText("“", 112, 190);
  const rtl = mark.book.language === "ar";
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = rtl ? "right" : "left";
  ctx.fillStyle = colors[1];
  ctx.font = `${fontSize}px "Newsreader", "Noto Naskh Arabic", Georgia, serif`;
  lines.forEach((line, i) =>
    ctx.fillText(line, rtl ? 1080 : 120, 240 + i * lineHeight),
  );
  ctx.font = '500 26px "DM Sans", "Noto Naskh Arabic", sans-serif';
  ctx.fillText(
    mark.book.title.slice(0, 100),
    rtl ? 1080 : 120,
    canvas.height - 225,
    960,
  );
  ctx.fillStyle = colors[2];
  ctx.font = '24px "DM Sans", "Noto Naskh Arabic", sans-serif';
  ctx.fillText(
    mark.book.authors.join(" · ").slice(0, 140) || "Personal reading",
    rtl ? 1080 : 120,
    canvas.height - 183,
    960,
  );
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.font = '600 24px "DM Sans", sans-serif';
  ctx.fillText("MLibrary  /  My Quotes", 120, canvas.height - 100);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Could not create the quote card")),
      "image/png",
    ),
  );
}

export async function exportQuote(mark: ReadingMark, share = false) {
  const blob = await quoteImage(mark);
  const filename = `mlibrary-quote-${mark.id.slice(0, 8)}.png`;
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const file = await Filesystem.writeFile({
      path: `quotes/${filename}`,
      directory: Directory.Cache,
      data,
      recursive: true,
    });
    await Share.share({
      title: mark.book.title,
      files: [file.uri],
      dialogTitle: "Save or share quote card",
    });
    return;
  }
  const file = new File([blob], filename, { type: "image/png" });
  if (share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: mark.book.title, files: [file] });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
