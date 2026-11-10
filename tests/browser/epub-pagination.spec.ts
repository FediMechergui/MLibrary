import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";

test("offscreen accessible EPUB captions do not create blank pages before the chapter", async ({
  page,
}) => {
  const zip = await JSZip.loadAsync(
    await readFile("tests/fixtures/reader.epub"),
  );
  const opf = await zip.file("OEBPS/content.opf")!.async("string");
  zip.file(
    "OEBPS/content.opf",
    opf
      .replace(
        "<manifest>",
        '<manifest><item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>',
      )
      .replace("<spine>", '<spine><itemref idref="title"/>'),
  );
  zip.file(
    "OEBPS/title.xhtml",
    `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Title page</title><style>
    .accessible { position:absolute; left:-999em; }
    h1 { font-size:2em; }
  </style></head><body><h1 class="accessible">Accessible book title</h1><p class="accessible">Accessible author</p>
  <p id="visible-title">A visible title page</p></body></html>`,
  );
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "Accessible title.epub",
    mimeType: "application/epub+zip",
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
  });
  await page
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
  await expect(page.locator(".page-indicator")).toContainText("Page 1 of 1");
  const title = page
    .frameLocator(".epub-reader iframe")
    .locator("#visible-title");
  await expect(title).toBeInViewport();
  // Keep the accessible caption and a compact frame, not a 30,000px strip.
  await expect(
    page.frameLocator(".epub-reader iframe").locator("h1"),
  ).toHaveText("Accessible book title");
  await expect.poll(async () =>
    (await page.locator(".epub-reader iframe").boundingBox())!.width,
  ).toBeLessThan(500);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  const chapter = page.frameLocator(".epub-reader iframe").locator("h1");
  await expect(chapter).toHaveText("The open library");
  await expect(chapter).toBeInViewport();
  await expect(
    page.frameLocator(".epub-reader iframe").locator("p"),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __epub_script_ran?: boolean }).__epub_script_ran,
    ),
  ).toBeUndefined();
});
