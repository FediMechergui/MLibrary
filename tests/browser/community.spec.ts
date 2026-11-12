import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

for (const [source, id, url] of [
  ["unglue", "140714", "https://unglue.it/work/140714/"],
  [
    "fadedpage",
    "201410E7",
    "https://www.fadedpage.com/showbook.php?pid=201410E7",
  ],
  [
    "globalgrey",
    "on-liberty",
    "https://www.globalgreyebooks.com/book-page/on-liberty-ebook.html",
  ],
])
  test(`${source} downloads into the reader and reopens offline`, async ({
    page,
  }) => {
    const epub = await readFile("tests/fixtures/reader.epub");
    const book = {
      id: `${source}:${id}`,
      source,
      sourceUrl: url,
      title: `${source} edition`,
      authors: ["Fixture author"],
      language: "en",
      languages: ["en"],
      cover: null,
      subjects: [],
      description: "",
      access: "read",
      rights: "Publisher credits retained",
      formats: ["EPUB"],
    };
    await page.route("**/api/import-community?**", (r) =>
      r.fulfill({ json: { book } }),
    );
    await page.route("**/api/content?**", (r) =>
      r.fulfill({
        json: {
          type: "remote",
          format: "epub",
          url,
          sourceUrl: url,
          attribution: book.rights,
          file: { source, id, format: "epub" },
        },
      }),
    );
    await page.route("**/api/file?**", (r) => {
      const p = new URL(r.request().url()).searchParams;
      expect(p.get("source")).toBe(source);
      expect(p.get("id")).toBe(id);
      return r.fulfill({
        body: epub,
        headers: { "X-Book-Length": String(epub.length) },
      });
    });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Our sources", exact: true })
      .click();
    const row = page.locator(`[data-source="${source}"]`);
    await row.locator("summary").click();
    await row.getByLabel("Book page link").fill(url);
    await row.getByRole("button", { name: "Download & read" }).click();
    await expect(page.locator(".epub-reader iframe")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          (id) =>
            JSON.parse(localStorage.getItem("mlibrary:v1")!).shelf[id]?.offline,
          book.id,
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

test("Anna search preserves query and language and reports verification honestly", async ({
  page,
  context,
}) => {
  await page.route("**/api/source-monitor", (r) =>
    r.fulfill({
      json: {
        checkedAt: "2026-11-12T12:00:00Z",
        domains: [{ domain: "annas-archive.gd", status: "PROTECTED" }],
      },
    }),
  );
  await context.route("https://annas-archive.gd/**", (r) =>
    r.fulfill({
      body: "<html><body>Provider verification</body></html>",
      contentType: "text/html",
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Our sources", exact: true }).click();
  const row = page.locator('[data-source="annas"]');
  await row.getByLabel("Title or author").fill("Les Argonautes");
  await row.getByText("Provider status · Open SLUM", { exact: true }).click();
  await expect(row.locator("li").first()).toContainText("PROTECTED");
  const popup = context.waitForEvent("page");
  await row.getByRole("button", { name: "Search & import" }).click();
  const opened = await popup;
  await opened.waitForLoadState();
  const u = new URL(opened.url());
  expect(u.hostname).toBe("annas-archive.gd");
  expect(u.searchParams.get("q")).toBe("Les Argonautes");
  expect(u.searchParams.get("lang")).toBe("en");
  await opened.close();
  await expect(row).toContainText("then use Import in MLibrary");
});
