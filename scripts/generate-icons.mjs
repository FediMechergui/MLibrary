import { chromium } from "@playwright/test";
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

const svg = await readFile("public/icon.svg", "utf8");
const browser = await chromium.launch({
  channel: process.env.CI ? undefined : "msedge",
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.setContent("<canvas></canvas>");
  async function render(target, width, height = width, splash = false) {
    const data = await page.evaluate(
      async ({ svg, width, height, splash }) => {
        const canvas = document.querySelector("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        const img = new Image();
        img.src = "data:image/svg+xml," + encodeURIComponent(svg);
        await img.decode();
        if (splash) {
          context.fillStyle = "#f5f2ea";
          context.fillRect(0, 0, width, height);
        }
        const size = splash ? Math.min(width, height) * 0.24 : width;
        context.drawImage(
          img,
          (width - size) / 2,
          (height - size) / 2,
          size,
          size,
        );
        return canvas.toDataURL("image/png").split(",")[1];
      },
      { svg, width, height, splash },
    );
    await writeFile(target, Buffer.from(data, "base64"));
  }
  await render("public/icon-192.png", 192);
  await render("public/icon-512.png", 512);
  const res = "android/app/src/main/res";
  for (const [density, size] of Object.entries({
    mdpi: 48,
    hdpi: 72,
    xhdpi: 96,
    xxhdpi: 144,
    xxxhdpi: 192,
  })) {
    for (const name of [
      "ic_launcher",
      "ic_launcher_round",
      "ic_launcher_foreground",
    ])
      await render(
        `${res}/mipmap-${density}/${name}.png`,
        name.endsWith("foreground") ? size * 2 : size,
      );
  }
  for (const entry of await readdir(res, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("drawable")) continue;
    const file = path.join(res, entry.name, "splash.png");
    try {
      const existing = await readFile(file);
      await render(
        file,
        existing.readUInt32BE(16),
        existing.readUInt32BE(20),
        true,
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  console.log(
    "Web, Android launcher, and splash assets generated from public/icon.svg.",
  );
} finally {
  await browser.close();
}
