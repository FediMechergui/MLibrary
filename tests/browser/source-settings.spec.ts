import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const book = {
  id: "archive:format-test",
  title: "Format recovery",
  authors: ["MLibrary"],
  source: "archive",
  language: "en",
  languages: ["en"],
  cover: null,
  sourceUrl: "https://archive.org/details/format-test",
  subjects: [],
  description: "",
  access: "source",
  rights: "Test fixture",
  formats: ["PDF"],
};
test("per-source preferences persist, exclude providers and select a fallback library", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Our sources", exact: true }).click();
  await expect(page.locator(".source-row")).toHaveCount(15);
  const archive = page.locator('[data-source="archive"]');
  await archive.locator("summary").click();
  await archive.getByLabel("Download format").selectOption("pdf");
  await archive.getByLabel("Fallback library").selectOption("wikisource");
  await archive.getByLabel("Search language").selectOption("fr");
  const wiki = page.locator('[data-source="wikisource"]');
  await wiki.locator("summary").click();
  await wiki.getByLabel("Include in all-source search").uncheck();
  await page.reload();
  await page.getByRole("button", { name: "Our sources", exact: true }).click();
  await archive.locator("summary").click();
  await expect(archive.getByLabel("Download format")).toHaveValue("pdf");
  await expect(archive.getByLabel("Search language")).toHaveValue("fr");
  await page.route("**/api/search?**", (route) =>
    route.fulfill({
      json: { books: [], sources: [], errors: [], page: 1, hasMore: false },
    }),
  );
  await archive
    .getByRole("button", { name: "Search fallback library", exact: true })
    .click();
  await expect(page.getByLabel("All sources", { exact: true })).toHaveValue(
    "wikisource",
  );
  await expect(page.getByLabel("All languages", { exact: true })).toHaveValue(
    "fr",
  );
  await page.getByLabel("All sources", { exact: true }).selectOption("all");
  const request = page.waitForRequest(
    (r) =>
      r.url().includes("/api/search?") &&
      new URL(r.url()).searchParams.get("q") === "recovery",
  );
  const search = page.getByRole("textbox", { name: "Search the catalogue" });
  await search.fill("recovery");
  await search.press("Enter");
  expect(new URL((await request).url()).searchParams.get("exclude")).toBe(
    "wikisource",
  );
});
test("an unavailable preferred format can recover inside the reader without a source website", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "mlibrary:v1",
      JSON.stringify({ version: 1, sources: { archive: { format: "pdf" } } }),
    ),
  );
  await page.route("**/api/search?**", (route) =>
    route.fulfill({
      json: { books: [book], sources: [], errors: [], page: 1, hasMore: false },
    }),
  );
  await page.route("**/api/content?**", (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).searchParams.get("format") === "pdf"
          ? {
              type: "source",
              reason: "format",
              available: false,
              message: "No PDF",
              url: book.sourceUrl,
              attribution: "Fixture",
            }
          : {
              type: "text",
              text: "A complete readable passage. ".repeat(200),
              chapters: [],
              sourceUrl: book.sourceUrl,
              attribution: "Fixture",
            },
    }),
  );
  await page.goto("/");
  const search = page.getByRole("textbox", { name: "Search the catalogue" });
  await search.fill("recovery");
  await search.press("Enter");
  await page.locator(".book-open").first().click();
  await page
    .getByRole("button", { name: "Open in reader", exact: true })
    .click();
  await expect(page.locator(".unavailable-edition")).toContainText(
    "This format is unavailable",
  );
  await page.getByLabel("Download format").selectOption("auto");
  await expect(page.locator(".text-page")).toContainText("readable passage");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("mlibrary:v1")!).shelf[
            "archive:format-test"
          ]?.offline,
      ),
    )
    .toBe(true);
});
test("an individual publisher link downloads, imports and opens an EPUB with attribution", async ({
  page,
}) => {
  const epub = await readFile("tests/fixtures/reader.epub");
  const edition = {
    ...book,
    id: "standardebooks:test-author/test-book",
    title: "Publisher EPUB",
    source: "standardebooks",
    formats: ["EPUB"],
    sourceUrl: "https://standardebooks.org/ebooks/test-author/test-book",
  };
  await page.route("**/api/import-standard?**", (route) =>
    route.fulfill({ json: { book: edition } }),
  );
  await page.route("**/api/content?**", (route) =>
    route.fulfill({
      json: {
        type: "remote",
        format: "epub",
        url: `${edition.sourceUrl}/downloads/test.epub?source=download`,
        sourceUrl: edition.sourceUrl,
        attribution: "Standard Ebooks fixture",
      },
    }),
  );
  await page.route("**/api/file?**", (route) => {
    expect(new URL(route.request().url()).searchParams.get("source")).toBe(
      "standardebooks",
    );
    return route.fulfill({
      body: epub,
      headers: { "X-Book-Length": String(epub.length) },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Our sources", exact: true }).click();
  const source = page.locator('[data-source="standardebooks"]');
  await source.locator("summary").click();
  await source.getByLabel("Standard Ebooks book link").fill(edition.sourceUrl);
  await source.getByRole("button", { name: "Download & read" }).click();
  await expect(page.locator(".epub-reader iframe")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("mlibrary:v1")!).shelf[
            "standardebooks:test-author/test-book"
          ]?.offline,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: /^My library/ }).click();
  await page.context().setOffline(true);
  await page.locator(".book-open").first().click();
  await page
    .getByRole("button", { name: "Continue reading", exact: true })
    .click();
  await expect(page.locator(".epub-reader iframe")).toBeVisible();
  await page.context().setOffline(false);
});
test("phone layouts keep books visible, navigation reachable and reader controls touch sized", async ({
  page,
}) => {
  for (const [width, height, language] of [
    [320, 740, "en"],
    [393, 852, "fr"],
    [393, 852, "ar"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.locator(".language-select select").selectOption(language);
    await expect(page.locator(".book-card").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await page.locator(".book-grid").boundingBox())!.y).toBeLessThan(
      height - 120,
    );
    for (const nav of await page.locator(".sidebar .nav-item").all())
      expect((await nav.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `artifacts/v1-mobile-${language}.png` });
  }
  await page.locator(".language-select select").selectOption("en");
  await page.locator('.book-open[aria-label="Pride and Prejudice"]').click();
  await page
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
  await expect(page.locator(".text-page")).toBeVisible();
  for (const control of await page
    .locator(".reader-topbar .icon-button")
    .all()) {
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: "artifacts/v1-mobile-reader.png" });
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Our sources", exact: true }).click();
  for (const source of await page.locator(".source-row").all()) {
    const summary = source.locator(".source-settings > summary");
    await summary.scrollIntoViewIfNeeded();
    await summary.click();
    await expect(source.locator(".source-settings")).toHaveAttribute("open", "");
    const body = (await source.locator(".source-body").boundingBox())!;
    const actions = (await source.locator(".source-actions").boundingBox())!;
    expect(actions.y).toBeGreaterThanOrEqual(body.y + body.height - 1);
    await summary.click();
  }
  await page.locator('[data-source="standardebooks"] summary').click();
  await page.getByLabel("Standard Ebooks book link").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/v1-mobile-sources.png" });
});
