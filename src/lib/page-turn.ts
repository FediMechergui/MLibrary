import type { ReaderSettings } from "../types";
const turning = new WeakSet<HTMLElement>();
const frame = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
export async function turnPage(
  root: HTMLElement | null,
  settings: ReaderSettings,
  direction: "next" | "prev",
  change: () => void | Promise<unknown>,
  rtl = false,
) {
  if (
    !root ||
    settings.mode !== "flip" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    await change();
    return;
  }
  if (turning.has(root)) return;
  turning.add(root);
  let changed = false,
    overlay: HTMLDivElement | undefined,
    flip: import("page-flip").PageFlip | undefined;
  try {
    const [{ default: snapshot }, { PageFlip }] = await Promise.all([
      import("html2canvas"),
      import("page-flip"),
    ]);
    if (!root.isConnected) return;
    const bounds = root.getBoundingClientRect(),
      width = Math.round(bounds.width),
      height = Math.round(bounds.height);
    if (width < 100 || height < 100) {
      changed = true;
      await change();
      return;
    }
    const capture = async () => {
      const image = await snapshot(root, {
        scale: 1,
        width,
        height,
        logging: false,
        useCORS: true,
        backgroundColor: getComputedStyle(root.closest(".reader") || root)
          .backgroundColor,
        ignoreElements: (el) => el.hasAttribute("data-reader-overlay"),
      });
      if (!rtl) return image;
      const mirror = document.createElement("canvas");
      mirror.width = image.width;
      mirror.height = image.height;
      const ctx = mirror.getContext("2d")!;
      ctx.translate(mirror.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0);
      return mirror;
    };
    const before = await capture();
    overlay = document.createElement("div");
    overlay.className = "page-turn-overlay";
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, {
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${width}px`,
      height: `${height}px`,
      transform: rtl ? "scaleX(-1)" : "none",
    });
    const cover = before;
    Object.assign(cover.style, {
      width: "100%",
      height: "100%",
      position: "absolute",
      inset: "0",
    });
    overlay.append(cover);
    document.body.append(overlay);
    changed = true;
    await change();
    await frame();
    if (!root.isConnected) return;
    const after = await capture(),
      host = document.createElement("div");
    Object.assign(host.style, { width: "100%", height: "100%" });
    overlay.append(host);
    flip = new PageFlip(host, {
      width,
      height,
      size: "fixed",
      startPage: direction === "next" ? 0 : 1,
      usePortrait: true,
      autoSize: false,
      drawShadow: true,
      maxShadowOpacity: 0.32,
      flippingTime: 650,
      useMouseEvents: false,
      mobileScrollSupport: false,
      showPageCorners: false,
      disableFlipByClick: true,
    });
    await new Promise<void>((resolve) => {
      let started = false;
      const timeout = setTimeout(resolve, 2000);
      flip!.on("changeState", (event) => {
        if (event.data === "flipping") started = true;
        if (started && event.data === "read") {
          clearTimeout(timeout);
          resolve();
        }
      });
      flip!.on("init", () => {
        cover.remove();
        requestAnimationFrame(() =>
          direction === "next" ? flip!.flipNext() : flip!.flipPrev(),
        );
      });
      flip!.loadFromImages(
        (direction === "next" ? [before, after] : [after, before]).map(
          (image) => image.toDataURL("image/png"),
        ),
      );
    });
  } catch {
    if (!changed) await change();
  } finally {
    flip?.destroy();
    overlay?.remove();
    turning.delete(root);
  }
}
export async function waitForPage(
  ready: () => boolean,
  root: HTMLElement | null,
) {
  const deadline = Date.now() + 10000;
  while (!ready() && root?.isConnected && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 30));
}
