import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const book = {
  id: "archive:download-fixture",
  title: "A downloadable book",
  authors: ["MLibrary"],
  source: "archive",
  language: "en",
  languages: ["en"],
  cover: null,
  sourceUrl: "https://archive.org/details/download-fixture",
  subjects: [],
  description: "",
  access: "source",
  rights: "Fixture rights",
  formats: ["EPUB"],
};
async function catalogue(page: Page, format = "epub") {
  await page.route("**/api/search?**", (route) =>
    route.fulfill({
      json: {
        books: [book],
        sources: [],
        errors: [],
        hasMore: false,
        page: 1,
      },
    }),
  );
  await page.route("**/api/content?**", (route) =>
    route.fulfill({
      json: {
        type: "remote",
        format,
        url: `https://archive.org/download/download-fixture/book.${format}`,
        attribution: "Original file attribution",
        sourceUrl: book.sourceUrl,
      },
    }),
  );
  await page.goto("/");
  const search = page.getByRole("textbox", { name: "Search the catalogue" });
  await search.fill("download");
  await search.press("Enter");
  await page.locator('.book-open[aria-label="A downloadable book"]').click();
  await page
    .getByRole("button", { name: "Open in reader", exact: true })
    .click();
}
async function savedFile(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ present: boolean; size?: number; attribution?: string }>(
        (resolve, reject) => {
          const request = indexedDB.open("keyval-store");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const tx = database.transaction("keyval");
            const read = tx
              .objectStore("keyval")
              .get("book:archive:download-fixture");
            read.onsuccess = () =>
              resolve({
                present: !!read.result,
                size: read.result?.data?.byteLength ?? read.result?.data?.size,
                attribution: read.result?.attribution,
              });
            tx.oncomplete = () => database.close();
          };
        },
      ),
  );
}
async function offlineFlag(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("mlibrary:v1")!).shelf[
        "archive:download-fixture"
      ].offline,
  );
}

test("EPUB downloads open automatically, keep attribution, and reopen offline", async ({
  page,
}) => {
  const bytes = await readFile("tests/fixtures/reader.epub");
  let requests = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/file?**", async (route) => {
    requests++;
    await pending;
    await route.fulfill({
      contentType: "application/octet-stream",
      headers: { "X-Book-Length": String(bytes.length) },
      body: bytes,
    });
  });
  try {
    await catalogue(page);
    await expect(page.getByRole("status")).toContainText(
      "Downloading your book",
    );
    expect(await offlineFlag(page)).toBe(false);
    release();
    await expect(
      page.frameLocator(".epub-reader iframe").locator("body"),
    ).toContainText("The open library");
    expect(await savedFile(page)).toEqual({
      present: true,
      size: bytes.length,
      attribution: "Original file attribution",
    });
    expect(await offlineFlag(page)).toBe(true);
    expect(page.context().pages()).toHaveLength(1);
    await page.getByRole("button", { name: "Back to library" }).click();
    await page.reload();
    await page.getByRole("button", { name: /^My library/ }).click();
    await page.locator('.book-open[aria-label="A downloadable book"]').click();
    await page.context().setOffline(true);
    await page
      .getByRole("button", { name: "Continue reading", exact: true })
      .click();
    await expect(
      page.frameLocator(".epub-reader iframe").locator("body"),
    ).toContainText("The open library");
    expect(requests).toBe(1);
  } finally {
    release();
    await page.context().setOffline(false);
  }
});

test("a transient file request retries automatically before importing", async ({
  page,
}) => {
  const bytes = await readFile("tests/fixtures/reader.epub");
  let requests = 0;
  await page.route("**/api/file?**", (route) => {
    if (++requests === 1) return route.abort("connectionreset");
    return route.fulfill({
      contentType: "application/octet-stream",
      headers: { "X-Book-Length": String(bytes.length) },
      body: bytes,
    });
  });
  await catalogue(page);
  await expect(
    page.frameLocator(".epub-reader iframe").locator("body"),
  ).toContainText("The open library");
  expect(requests).toBe(2);
  expect(await offlineFlag(page)).toBe(true);
});

test("cancelled downloads do not import a partial file", async ({ page }) => {
  const bytes = await readFile("tests/fixtures/reader.epub");
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/file?**", async (route) => {
    await pending;
    await route
      .fulfill({
        contentType: "application/octet-stream",
        headers: { "X-Book-Length": String(bytes.length) },
        body: bytes,
      })
      .catch(() => {});
  });
  try {
    await catalogue(page);
    await expect(page.getByRole("status")).toContainText(
      "Downloading your book",
    );
    const failedRequest = page.waitForEvent("requestfailed", (request) =>
      request.url().includes("/api/file?"),
    );
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await failedRequest;
    release();
    await expect(page.locator(".reader")).toHaveCount(0);
    expect(await savedFile(page)).toEqual({ present: false });
    expect(await offlineFlag(page)).toBe(false);
  } finally {
    release();
  }
});

test("an interrupted file retries without a partial offline copy or duplicate shelf entry", async ({
  page,
}) => {
  const original = await readFile("tests/fixtures/reader.pdf");
  const xref = original.toString().match(/startxref\s+(\d+)/)![1];
  const pdf = Buffer.concat([
    original,
    Buffer.alloc(1048576, 32),
    Buffer.from(`\nstartxref\n${xref}\n%%EOF`),
  ]);
  let fail = true;
  await page.route("**/api/file?**", (route) => {
    const query = new URL(route.request().url()).searchParams;
    const start = Number(query.get("start")),
      end = Math.min(Number(query.get("end")) + 1, pdf.length);
    if (start > 0 && fail)
      return route.fulfill({
        status: 503,
        json: { error: "Download interrupted" },
      });
    return route.fulfill({
      contentType: "application/octet-stream",
      headers: { "X-Book-Length": String(pdf.length) },
      body: pdf.subarray(start, end),
    });
  });
  await catalogue(page, "pdf");
  await expect(page.getByRole("alert")).toContainText("Download interrupted");
  expect(await savedFile(page)).toEqual({ present: false });
  expect(await offlineFlag(page)).toBe(false);
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect
    .poll(() => savedFile(page))
    .toEqual({
      present: true,
      size: pdf.length,
      attribution: "Original file attribution",
    });
  await expect(page.locator(".textLayer")).toContainText(
    "MLibrary PDF reading test",
  );
  expect(await offlineFlag(page)).toBe(true);
  expect(
    await page.evaluate(() =>
      Object.keys(JSON.parse(localStorage.getItem("mlibrary:v1")!).shelf),
    ),
  ).toEqual([book.id]);
});

test("storage failure stays retryable and never claims the book is downloaded", async ({
  page,
}) => {
  const bytes = await readFile("tests/fixtures/reader.epub");
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (
        key === "book:archive:download-fixture" &&
        !(window as unknown as { allowBookStorage?: boolean }).allowBookStorage
      )
        throw new DOMException("Test device is full", "QuotaExceededError");
      return original.call(this, value, key);
    };
  });
  await page.route("**/api/file?**", (route) =>
    route.fulfill({
      contentType: "application/octet-stream",
      headers: { "X-Book-Length": String(bytes.length) },
      body: bytes,
    }),
  );
  await catalogue(page);
  await expect(page.getByRole("alert")).toContainText(
    "Free some device storage",
  );
  expect(await savedFile(page)).toEqual({ present: false });
  expect(await offlineFlag(page)).toBe(false);
  await page.evaluate(() => {
    (window as unknown as { allowBookStorage: boolean }).allowBookStorage =
      true;
  });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.frameLocator(".epub-reader iframe").locator("body"),
  ).toContainText("The open library");
  expect(await offlineFlag(page)).toBe(true);
});
