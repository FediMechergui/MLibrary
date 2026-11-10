import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

for (const source of ["oapen", "doab"])
  test(`${source} book links download into the PDF reader and reopen offline`, async ({
    page,
  }) => {
    const pdf = await readFile("tests/fixtures/reader.pdf");
    const sourceUrl =
      source === "oapen"
        ? "https://library.oapen.org/handle/20.500.12657/123"
        : "https://directory.doabooks.org/handle/20.500.12854/123";
    const book = {
      id: `${source}:123`,
      source,
      title: "Public repository book",
      authors: ["MLibrary"],
      language: "en",
      languages: ["en"],
      sourceUrl,
      cover: null,
      subjects: [],
      description: "Public test edition",
      rights: "CC BY 4.0",
      formats: ["PDF"],
      access: "source",
    };
    await page.route("**/api/import-openaccess?**", (route) =>
      route.fulfill({ json: { book } }),
    );
    await page.route("**/api/content?**", (route) =>
      route.fulfill({
        json: {
          type: "remote",
          format: "pdf",
          url: "https://library.oapen.org/bitstream/20.500.12657/123/1/book.pdf",
          sourceUrl,
          attribution: "Open repository · CC BY 4.0",
          file: { source, id: "123", format: "pdf" },
        },
      }),
    );
    await page.route("**/api/file?**", (route) => {
      const params = new URL(route.request().url()).searchParams;
      expect(params.get("source")).toBe(source);
      expect(params.get("id")).toBe("123");
      expect(params.get("format")).toBe("pdf");
      return route.fulfill({
        body: pdf,
        headers: { "X-Book-Length": String(pdf.length) },
      });
    });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Our sources", exact: true })
      .click();
    const panel = page.locator(`[data-source="${source}"]`);
    await panel.locator("summary").click();
    await panel.getByLabel("Repository book link").fill(sourceUrl);
    await panel.getByRole("button", { name: "Download & read" }).click();
    await expect(page.locator(".pdf-reader canvas")).toBeVisible();
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
    await expect(page.locator(".pdf-reader canvas")).toBeVisible();
    await page.context().setOffline(false);
  });
