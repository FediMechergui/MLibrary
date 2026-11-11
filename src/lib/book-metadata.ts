import type { AppState, Book } from "../types";
export function updateBookDetails(state: AppState, book: Book): AppState {
  const entry = state.shelf[book.id];
  return {
    ...state,
    shelf: entry
      ? { ...state.shelf, [book.id]: { ...entry, book } }
      : state.shelf,
    marks: Object.fromEntries(
      Object.entries(state.marks).map(([id, mark]) => [
        id,
        mark.book.id === book.id ? { ...mark, book } : mark,
      ]),
    ),
  };
}
export async function embeddedMetadata(
  data: ArrayBuffer,
  format: string,
): Promise<Partial<Book>> {
  try {
    if (format === "pdf") {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.load(data, {
        ignoreEncryption: true,
        updateMetadata: false,
      });
      return {
        title: pdf.getTitle()?.trim().slice(0, 500),
        authors: (pdf.getAuthor() || "")
          .split(/;|؛/)
          .map((v) => v.trim())
          .filter(Boolean)
          .slice(0, 20),
        description: pdf.getSubject()?.slice(0, 4000),
      };
    }
    if (format === "epub") {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(data);
      const xml = async (name: string) => {
        const entry = zip.file(name);
        if (
          !entry ||
          name.split("/").includes("..") ||
          ((entry as unknown as { _data?: { uncompressedSize?: number } })._data
            ?.uncompressedSize || 0) >
            2 * 1024 * 1024
        )
          throw new Error("Metadata too large");
        const text = await entry.async("string");
        if (text.length > 2 * 1024 * 1024)
          throw new Error("Metadata too large");
        return new DOMParser().parseFromString(text, "application/xml");
      };
      const container = await xml("META-INF/container.xml"),
        path = container
          .getElementsByTagName("rootfile")[0]
          ?.getAttribute("full-path");
      if (!path) return {};
      const doc = await xml(path),
        values = (name: string) =>
          [
            ...doc.getElementsByTagNameNS(
              "http://purl.org/dc/elements/1.1/",
              name,
            ),
          ]
            .map((el) => el.textContent?.trim().slice(0, 500) || "")
            .filter(Boolean);
      return {
        title: values("title")[0],
        authors: values("creator").slice(0, 20),
        language: values("language")[0]?.split("-")[0],
        description: values("description")[0],
      };
    }
  } catch {
    /* Missing metadata must not prevent importing a readable file. */
  }
  return {};
}
export async function imagePdf(data: ArrayBuffer) {
  const bitmap = await createImageBitmap(new Blob([data]));
  try {
    if (bitmap.width * bitmap.height > 25000000)
      throw new Error("Image too large");
    const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const { PDFDocument } = await import("pdf-lib"),
      pdf = await PDFDocument.create();
    const image = await pdf.embedJpg(canvas.toDataURL("image/jpeg", 0.94));
    const page = pdf.addPage([canvas.width, canvas.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
    });
    const bytes = await pdf.save();
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
  } finally {
    bitmap.close();
  }
}
