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

export async function quoteImage(mark: ReadingMark, part = 0): Promise<Blob> {
  const { renderQuote } = await import("./quote-design");
  const { canvas } = await renderQuote(mark, undefined, part);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not create card")),
      "image/png",
    ),
  );
}

export async function exportQuote(mark: ReadingMark, share = false, part = 0) {
  const blob = await quoteImage(mark, part);
  const filename = `mlibrary-quote-${mark.id.slice(0, 8)}-${part + 1}.png`;
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
