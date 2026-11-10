import { test, expect } from "@playwright/test";

test("reader waits for its font before enabling the first page turn", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  let releaseFonts!: () => void;
  const fonts = new Promise<void>((resolve) => {
    releaseFonts = resolve;
  });
  await page.route(/newsreader.*\.woff2$/, async (route) => {
    await fonts;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator(".book-grid .book-open").first().click();
    await page
      .getByRole("button", { name: "Start reading", exact: true })
      .click();
    await expect(page.locator(".text-page")).toContainText("Project Gutenberg");
    const next = page.getByRole("button", { name: "Next page", exact: true });
    await expect(next).toBeDisabled();
    releaseFonts();
    await expect(next).toBeEnabled();
    await next.click();
    await expect(page.locator(".page-indicator")).toContainText("Page 2");
  } finally {
    releaseFonts();
  }
});

test("discover, save, read, bookmark, change theme, and reopen offline copy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "So many worlds. One little library." }),
  ).toBeVisible();
  await expect(page.locator(".book-grid .book-card")).toHaveCount(36);
  await page.screenshot({
    path: "artifacts/desktop-library.png",
    fullPage: true,
  });
  await page.locator(".book-grid .book-open").first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save to library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
  await expect(page.locator(".text-page")).toContainText("Project Gutenberg");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".page-indicator")).toContainText("Page 2");
  await page.getByRole("button", { name: "Bookmark this page" }).click();
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByRole("button", { name: "Sepia", exact: true }).click();
  await expect(page.locator(".reader")).toHaveClass(/theme-sepia/);
  await page.getByRole("button", { name: "Save offline", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Saved offline", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.screenshot({ path: "artifacts/reader-desktop.png" });
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: /^My library/ }).click();
  await expect(page.locator(".book-grid .book-card")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: /^My library/ }).click();
  await page.locator(".book-open").first().click();
  await page.context().setOffline(true);
  await page
    .getByRole("button", { name: "Continue reading", exact: true })
    .click();
  await expect(page.locator(".text-page")).toBeVisible();
  await page.getByRole("button", { name: "Contents & bookmarks" }).click();
  await expect(page.locator(".bookmark-row")).toHaveCount(1);
  await page.context().setOffline(false);
});

test("bulk catalogue search finds French editions and supports pagination", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("All sources", { exact: true })
    .selectOption("gutenberg");
  await page.getByLabel("All languages", { exact: true }).selectOption("fr");
  await expect(page.locator(".book-grid .book-card")).toHaveCount(24);
  await page.getByRole("button", { name: "Browse more books" }).click();
  await expect(page.locator(".book-grid .book-card")).toHaveCount(48);
  await page
    .getByRole("textbox", { name: "Search the catalogue" })
    .fill("misérables");
  await page
    .getByRole("textbox", { name: "Search the catalogue" })
    .press("Enter");
  await expect(page.locator(".book-grid")).toContainText(/misérables/i);
  await expect(page.locator(".book-language").first()).toHaveText("Français");
});

test("mobile Arabic layout, imported text, scroll mode, and reading milestones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.clock.install();
  await page.goto("/");
  await page.getByLabel("Language", { exact: true }).selectOption("ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "عوالم كثيرة. مكتبة واحدة." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/mobile-arabic.png",
    fullPage: true,
  });
  await page.getByLabel("اللغة", { exact: true }).selectOption("en");
  await page.getByRole("button", { name: /^My library/ }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "The Quiet Library.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "A library is a place where many voices can be heard. Read a little, and discover another world.\n\n".repeat(
        120,
      ),
    ),
  });
  await page
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
  await expect(page.locator(".text-page")).toContainText(
    "A library is a place",
  );
  // Reading time starts after font loading and pagination make the book ready.
  await expect(
    page.getByRole("button", { name: "Next page", exact: true }),
  ).toBeEnabled();
  await page.clock.runFor(65000);
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByRole("button", { name: "Scroll", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".text-reader")).toHaveClass(/mode-scroll/);
  await page.getByRole("button", { name: "Back to library" }).click();
  await page
    .getByRole("button", { name: "Reading journey", exact: true })
    .click();
  await expect(page.locator(".milestone.earned")).toContainText(
    "The first chapter",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("imports and renders PDF and EPUB editions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^My library/ }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/reader.pdf");
  await page
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
  await expect(page.locator(".pdf-reader canvas")).toBeVisible();
  await expect
    .poll(async () =>
      page
        .locator(".pdf-reader canvas")
        .evaluate((canvas: HTMLCanvasElement) => canvas.width),
    )
    .toBeGreaterThan(300);
  await page.getByRole("button", { name: "Back to library" }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/reader.epub");
  await page
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
  await expect(page.locator(".epub-reader iframe")).toBeVisible({
    timeout: 20000,
  });
  await expect(
    page.frameLocator(".epub-reader iframe").locator("body"),
  ).toContainText("The open library");
  expect(
    await page.locator(".epub-reader iframe").getAttribute("sandbox"),
  ).not.toContain("allow-scripts");
});

test("source directory distinguishes integrated books from external collections", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Our sources", exact: true }).click();
  await expect(page.locator(".source-row")).toHaveCount(10);
  await expect(page.locator(".source-summary")).toContainText(
    "A catalogue record is not a free copy",
  );
  await expect(page.locator(".source-tag.integrated")).toHaveCount(3);
  await expect(page.locator('[data-source="gallica"] .source-tag')).toHaveClass(
    /integrated/,
  );
  await expect(
    page.locator('[data-source="qdl"] .source-status'),
  ).toContainText("Access challenge");
});
