import { test, expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
async function scanImage(
  page: Page,
  text = "A library opens a thousand worlds.",
) {
  return page.evaluate(async (text) => {
    await document.fonts.ready;
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 600;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1200, 600);
    ctx.fillStyle = "#111";
    ctx.font = '46px "Noto Naskh Arabic", Arial';
    ctx.fillText(text, 60, 170);
    ctx.fillText("Every reader has a story.", 60, 250);
    return c.toDataURL("image/png").split(",")[1];
  }, text);
}
async function importScan(page: Page) {
  await page.goto("/");
  const png = Buffer.from(await scanImage(page), "base64"),
    pdf = await PDFDocument.create();
  const image = await pdf.embedPng(png);
  pdf
    .addPage([600, 300])
    .drawImage(image, { x: 0, y: 0, width: 600, height: 300 });
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "Scanned pages.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await pdf.save()),
    });
  await page.getByLabel("Book title", { exact: true }).fill("The Open Library");
  await page.getByLabel("Author", { exact: true }).fill("M. Reader");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await page
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Quote from scan", exact: true })
    .click();
}
test("scanned PDF crop uses online OCR, allows corrections and selection, and keeps attribution", async ({
  page,
}) => {
  let crop = "";
  await page.route("**/api/ocr", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { online: true } });
    crop = route.request().postDataJSON().image;
    return route.fulfill({
      json: {
        text: "A library opens a thousand worlds. Every reader has a story.",
      },
    });
  });
  await importScan(page);
  await page
    .getByRole("combobox", { name: "Recognition", exact: true })
    .selectOption("online");
  const box = (await page.locator(".ocr-crop-surface").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.04, box.y + box.height * 0.18);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.94, box.y + box.height * 0.53);
  await page.mouse.up();
  await page.getByRole("button", { name: "Extract text", exact: true }).click();
  const result = page.locator(".ocr-result textarea");
  await expect(result).toContainText("A library opens");
  expect(crop).toMatch(/^data:image\/jpeg;base64,/);
  await result.fill("A library opens new worlds. Every reader has a story.");
  await result.focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.down("Shift");
  for (let i = 0; i < 27; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Shift");
  await page
    .getByRole("button", { name: "Quote selected text", exact: true })
    .click();
  await expect(page.locator(".quote-attribution")).toContainText(
    "The Open Library",
  );
  await expect(page.locator(".quote-attribution")).toContainText("M. Reader");
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  const mark = await page.evaluate(
    () =>
      Object.values(
        JSON.parse(localStorage.getItem("mlibrary:v1")!).marks,
      )[0] as any,
  );
  expect(mark.text).toBe("A library opens new worlds.");
  expect(mark.anchor.ocr).toBe(true);
  expect(mark.anchor.region.width).toBeLessThan(1);
  expect(mark.anchor.start).toBeUndefined();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: /^My Quotes/ }).click();
  await page
    .getByRole("button", { name: "Customize card", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Format", exact: true })
    .selectOption("square");
  await page
    .getByRole("combobox", { name: "Layout", exact: true })
    .selectOption("centered");
  await expect(page.locator(".quote-preview-area")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(
    await page
      .locator(".quote-preview")
      .evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight]),
  ).toEqual([1080, 1080]);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG", exact: true }).click();
  expect((await downloading).suggestedFilename()).toMatch(/\.png$/);
  await page.getByRole("button", { name: "Save design", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /^My Quotes/ }).click();
  await page
    .getByRole("button", { name: "Customize card", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Layout", exact: true }),
  ).toHaveValue("centered");
  await expect(page.locator(".quote-preview-area")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.screenshot({ path: "artifacts/v1-quote-studio.png" });
});
test("local OCR actually reads a scan without contacting an online OCR service", async ({
  page,
}) => {
  await page.route("**/api/ocr", (route) =>
    route.fulfill({ json: { online: false } }),
  );
  await importScan(page);
  await page.getByRole("button", { name: "Extract text", exact: true }).click();
  await expect(page.locator(".ocr-result textarea")).toContainText(
    "library opens",
    { timeout: 60000 },
  );
  await page.screenshot({ path: "artifacts/v1-scan-ocr.png" });
});
test("uploaded images become readable PDFs with editable metadata", async ({
  page,
}) => {
  await page.goto("/");
  const image = Buffer.from(await scanImage(page), "base64");
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "Photo.png", mimeType: "image/png", buffer: image });
  await page
    .getByLabel("Book title", { exact: true })
    .fill("A photographed page");
  await page.getByLabel("Author", { exact: true }).fill("Photo Author");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await page
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
  await expect(page.locator(".pdf-page canvas")).toBeVisible();
  await expect(page.locator(".reader-title")).toContainText("Photo Author");
  await page
    .getByRole("button", { name: "Edit book details", exact: true })
    .click();
  await page.getByLabel("Book title", { exact: true }).fill("Renamed photo");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.locator(".reader-title")).toContainText("Renamed photo");
});
test("page curl renders a real animation and settles on a selectable page", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "Page turns.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "Every new page opens a different world. ".repeat(1000),
      ),
    });
  await page
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".page-turn-overlay .stf__parent")).toBeVisible();
  await expect(page.locator(".page-turn-overlay")).toHaveCount(0);
  await expect(page.locator(".page-indicator")).toContainText("Page 2");
  await expect(page.locator("[data-reading-text]").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await expect(page.locator(".page-indicator")).toContainText("Page 1");
});
test("Arabic story cards paginate long quotes and all export formats fit a mobile screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => {
    const book = {
      id: "local:studio-arabic",
      title: "أبواب المعرفة",
      authors: ["قارئ الكتب"],
      language: "ar",
      languages: ["ar"],
      source: "local",
      sourceUrl: "",
      cover: null,
      subjects: [],
      description: "",
      access: "read",
      rights: "Personal import",
      formats: ["PDF"],
    };
    const mark = {
      id: "long-arabic",
      book,
      text: "القراءة تفتح أبواب المعرفة وتمنحنا عوالم جديدة. ".repeat(70),
      anchor: { type: "pdf", page: 12, ocr: true },
      color: "honey",
      note: "",
      tags: [],
      quoted: true,
      favorite: false,
      cardStyle: "paper",
      createdAt: Date.now(),
    };
    localStorage.setItem(
      "mlibrary:v1",
      JSON.stringify({ version: 1, marks: { [mark.id]: mark } }),
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: /^My Quotes/ }).click();
  await page
    .getByRole("button", { name: "Customize card", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Next card", exact: true }),
  ).toBeEnabled();
  for (const [format, size] of [
    ["story", [1080, 1920]],
    ["square", [1080, 1080]],
    ["portrait", [1080, 1350]],
    ["landscape", [1920, 1080]],
  ] as const) {
    await page
      .getByRole("combobox", { name: "Format", exact: true })
      .selectOption(format);
    await expect(page.locator(".quote-preview-area")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect
      .poll(() =>
        page
          .locator(".quote-preview")
          .evaluate((el: HTMLImageElement) => [
            el.naturalWidth,
            el.naturalHeight,
          ]),
      )
      .toEqual(size);
  }
  await page
    .getByRole("combobox", { name: "Format", exact: true })
    .selectOption("story");
  await expect(page.locator(".quote-preview-area")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await expect(page.locator(".quote-part-controls span")).toContainText("2 /");
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.locator(".quote-studio").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: "artifacts/v1-studio-arabic-mobile.png" });
});
