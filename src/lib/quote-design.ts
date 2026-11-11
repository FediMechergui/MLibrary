import type { QuoteDesign, ReadingMark } from "../types";
export const quoteFormats = {
  story: [1080, 1920],
  square: [1080, 1080],
  portrait: [1080, 1350],
  landscape: [1920, 1080],
} as const;
export const quotePalettes = [
  { background: "#faf2e8", foreground: "#402a32", accent: "#913d56" },
  { background: "#163e35", foreground: "#fff6e5", accent: "#bed0ab" },
  { background: "#eed6c5", foreground: "#4d302b", accent: "#875341" },
  { background: "#172c48", foreground: "#f1f4fc", accent: "#b2c9e9" },
];
export function quoteDesign(mark: ReadingMark): QuoteDesign {
  const palette =
    quotePalettes[
      mark.cardStyle === "forest" ? 1 : mark.cardStyle === "clay" ? 2 : 0
    ];
  return {
    format: "story",
    layout: "editorial",
    font: "serif",
    fontSize: 56,
    lineHeight: 1.45,
    align: "start",
    padding: 92,
    showTitle: true,
    showAuthor: true,
    showBrand: true,
    showPage: true,
    imageShade: 0.6,
    ...palette,
    ...mark.cardDesign,
  };
}
const families = {
  serif: '"Newsreader", "Noto Naskh Arabic", Georgia, serif',
  sans: '"DM Sans", "Noto Naskh Arabic", sans-serif',
};
export function wrapQuote(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (ctx.measureText(line ? `${line} ${word}` : word).width <= width) {
        line = line ? `${line} ${word}` : word;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      for (const char of Array.from(word)) {
        if (line && ctx.measureText(line + char).width > width) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}
async function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}
export async function renderQuote(
  mark: ReadingMark,
  design = quoteDesign(mark),
  part = 0,
) {
  await Promise.all([
    document.fonts.load(`56px ${families[design.font]}`, mark.text),
    document.fonts.load(
      `24px ${families.sans}`,
      mark.book.title + mark.book.authors.join(" "),
    ),
  ]);
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = quoteFormats[design.format];
  const ctx = canvas.getContext("2d")!,
    w = canvas.width,
    h = canvas.height,
    pad = Math.max(48, Math.min(160, design.padding));
  const safe = design.format === "story" ? 200 : pad,
    width = w - 2 * pad;
  ctx.fillStyle = design.background;
  ctx.fillRect(0, 0, w, h);
  if (design.backgroundImage?.startsWith("data:image/")) {
    const image = await loadImage(design.backgroundImage),
      scale = Math.max(w / image.width, h / image.height);
    ctx.drawImage(
      image,
      (w - image.width * scale) / 2,
      (h - image.height * scale) / 2,
      image.width * scale,
      image.height * scale,
    );
    ctx.globalAlpha = design.imageShade;
    ctx.fillStyle = design.background;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
  const rtl = /[\u0600-\u06ff]/.test(mark.text) || mark.book.language === "ar";
  const aligned = design.layout === "centered" ? "center" : design.align;
  const align =
    aligned === "center"
      ? "center"
      : (aligned === "start") !== rtl
        ? "left"
        : "right";
  const x = align === "center" ? w / 2 : align === "right" ? w - pad : pad;
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  let metaSize = 26,
    title: string[] = [],
    author: string[] = [];
  const meta = () => {
    ctx.font = `500 ${metaSize}px ${families.sans}`;
    title = design.showTitle ? wrapQuote(ctx, mark.book.title, width) : [];
    author = design.showAuthor
      ? wrapQuote(ctx, mark.book.authors.join(" · "), width)
      : [];
  };
  meta();
  while (
    (title.length + author.length) * metaSize * 1.4 > h * 0.25 &&
    metaSize > 12
  ) {
    metaSize -= 2;
    meta();
  }
  const footer = design.showBrand || design.showPage ? 64 : 0,
    metaHeight = (title.length + author.length) * metaSize * 1.4 + 32;
  const bottom = h - safe - footer,
    metaY = bottom - metaHeight;
  const top =
      safe +
      (design.layout === "editorial"
        ? 120
        : design.layout === "poster"
          ? 72
          : 24),
    lineHeight = design.fontSize * design.lineHeight;
  ctx.font = `${design.layout === "poster" ? "600 " : ""}${design.fontSize}px ${families[design.font]}`;
  const lines = wrapQuote(ctx, mark.text, width),
    count = Math.max(1, Math.floor((metaY - top - 40) / lineHeight));
  const pages = Array.from(
    { length: Math.ceil(lines.length / count) },
    (_, i) => lines.slice(i * count, (i + 1) * count),
  );
  const page = Math.max(0, Math.min(part, pages.length - 1)),
    visible = pages[page];
  ctx.fillStyle = design.accent;
  if (design.layout === "editorial") {
    ctx.font = `140px ${families.serif}`;
    ctx.fillText("“", x, safe - 8);
  }
  if (design.layout === "poster") {
    ctx.fillRect(pad, safe, width, 14);
  }
  if (design.layout === "centered") {
    ctx.fillRect(w / 2 - 32, safe, 64, 4);
  }
  const startY =
    design.layout === "centered" || design.layout === "minimal"
      ? top + Math.max(0, (metaY - top - 40 - visible.length * lineHeight) / 2)
      : top;
  ctx.fillStyle = design.foreground;
  ctx.font = `${design.layout === "poster" ? "600 " : ""}${design.fontSize}px ${families[design.font]}`;
  visible.forEach((line, i) => ctx.fillText(line, x, startY + i * lineHeight));
  ctx.font = `500 ${metaSize}px ${families.sans}`;
  ctx.direction = /[\u0600-\u06ff]/.test(mark.book.title) ? "rtl" : "ltr";
  title.forEach((line, i) => ctx.fillText(line, x, metaY + i * metaSize * 1.4));
  ctx.fillStyle = design.accent;
  ctx.direction = /[\u0600-\u06ff]/.test(mark.book.authors.join(" "))
    ? "rtl"
    : "ltr";
  author.forEach((line, i) =>
    ctx.fillText(line, x, metaY + (title.length + i) * metaSize * 1.4 + 8),
  );
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.font = `500 22px ${families.sans}`;
  if (design.showBrand)
    ctx.fillText("MLibrary / My Quotes", pad, h - safe - 24);
  if (design.showPage) {
    ctx.textAlign = "right";
    ctx.fillText(
      `${mark.anchor.page + 1}${pages.length > 1 ? `  ·  ${page + 1}/${pages.length}` : ""}`,
      w - pad,
      h - safe - 24,
    );
  }
  return { canvas, pages, page };
}
export async function quoteBackground(file: File) {
  if (
    !/^image\/(png|jpeg|webp)$/.test(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error("Image too large");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas"),
      scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.6, 0.4, 0.2]) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.length < 220000) return data;
    }
    throw new Error("Image too detailed");
  } finally {
    bitmap.close();
  }
}
