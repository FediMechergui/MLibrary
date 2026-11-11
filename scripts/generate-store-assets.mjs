import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
await mkdir("artifacts/store", { recursive: true });
await writeFile(
  "artifacts/store/icon-512.png",
  await readFile("public/icon-512.png"),
);
const icon = (await readFile("public/icon.svg")).toString("base64");
const browser = await chromium.launch({
  channel: process.env.CI ? undefined : "msedge",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 500 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><rect width="1024" height="500" fill="#f7f6f2"/><path d="M690 0H1024V500H690Z" fill="#e9dde1"/><image href="data:image/svg+xml;base64,${icon}" x="64" y="62" width="74" height="74"/><text x="64" y="245" font-family="Georgia,serif" font-size="84" fill="#4d3036">MLibrary.</text><text x="69" y="304" font-family="Arial,sans-serif" font-size="26" fill="#68565d">A world between the covers.</text><text x="69" y="405" font-family="Arial,sans-serif" font-size="20" letter-spacing="3" fill="#754451">ENGLISH  ·  FRANÇAIS  ·  العربية</text><g transform="translate(727 89) rotate(-7 104 161)"><rect width="202" height="300" rx="9" fill="#4d3036"/><path d="M16 0V300" stroke="#8e6974" stroke-width="2"/><rect x="38" y="42" width="132" height="200" fill="none" stroke="#cfb2bb"/><path d="M68 125Q87 111 105 125Q124 111 142 125V167Q124 154 105 168Q87 154 68 167Z" fill="none" stroke="#f7eee7" stroke-width="3"/><path d="M105 125V168" stroke="#f7eee7" stroke-width="2"/><text x="105" y="211" text-anchor="middle" font-family="Georgia,serif" font-size="18" fill="#f7eee7">Read. Remember.</text></g></svg></body></html>`,
  );
  await page
    .locator("svg")
    .screenshot({ path: "artifacts/store/feature-1024x500.png" });
  console.log("Store icon and feature graphic generated.");
} finally {
  await browser.close();
}
