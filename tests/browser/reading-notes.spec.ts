import { test, expect, type Page } from "@playwright/test";
function rangedPdf() {
  const pages = 400;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (let page = 0; page < pages; page++) {
    const stream =
      "BT /F1 12 Tf 45 780 Td " +
      Array.from(
        { length: 36 },
        (_, line) =>
          `(MLibrary page ${page + 1}, line ${line + 1}. A real paragraph in a readable book.) Tj 0 -19 Td`,
      ).join("\n") +
      " ET";
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + page * 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

async function importText(page: Page) {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "A room for reading.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Keep a little room for the words that stay with you. Every page opens a new window.\n\n".repeat(
        200,
      ),
    ),
  });
  await page
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
  await expect(page.locator(".text-page")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next page", exact: true }),
  ).toBeEnabled();
}
async function selectText(page: Page, selector: string, length = 49) {
  await page
    .locator(selector)
    .first()
    .evaluate((el, count) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const node = walker.nextNode()!;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, Math.min(count, node.textContent!.length));
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    }, length);
}
test("text highlights persist, become tagged quote cards, export, and return to the passage", async ({
  page,
}) => {
  await importText(page);
  await selectText(page, "[data-reading-text]");
  await expect(page.locator(".mark-editor")).toBeVisible();
  await page
    .getByLabel("Your note", { exact: true })
    .fill("A reminder for the morning.");
  await page
    .getByLabel("Tags", { exact: true })
    .fill("reflection, favorites, reflection");
  await page.getByRole("button", { name: "Sage", exact: true }).click();
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await expect(page.locator(".text-page mark")).toContainText(
    "Keep a little room",
  );
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.locator("#font-size").fill("26");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".text-page mark")).toContainText(
    "Keep a little room",
  );
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: /^My Quotes/ }).click();
  await expect(page.locator(".quote-card")).toHaveCount(1);
  await expect(page.locator(".quote-note")).toHaveText(
    "A reminder for the morning.",
  );
  await expect(page.locator(".quote-tags button")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Favorite quote", exact: true })
    .click();
  await page.getByRole("button", { name: "Forest", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save card", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^mlibrary-quote-.*\.png$/,
  );
  await page.screenshot({ path: "artifacts/myquotes-desktop.png" });
  await page.reload();
  await page.getByRole("button", { name: /^My Quotes/ }).click();
  await expect(page.locator(".quote-card")).toHaveClass(/card-forest/);
  await expect(
    page.getByRole("button", { name: "Favorite quote", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Return to passage", exact: true })
    .click();
  await expect(page.locator(".text-page mark")).toContainText(
    "Keep a little room",
  );
  await page.locator(".text-page mark").click();
  await expect(page.getByLabel("Your note", { exact: true })).toHaveValue(
    "A reminder for the morning.",
  );
});

test("PDF text is selectable and annotations stay on their page", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/reader.pdf");
  await page
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
  await expect(page.locator(".textLayer")).toContainText("MLibrary");
  await selectText(page, ".textLayer");
  await page
    .getByRole("button", { name: "Save highlight", exact: true })
    .click();
  await expect(page.locator(".textLayer mark")).toHaveCount(1);
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: /^My library/ }).click();
  await page.locator(".book-open").click();
  await page
    .getByRole("button", { name: "Continue reading", exact: true })
    .click();
  await expect(page.locator(".textLayer mark")).toHaveCount(1);
});

test("EPUB selections become CFI anchored quotes without enabling scripts", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/reader.epub");
  await page
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
  const body = page.frameLocator(".epub-reader iframe").locator("body");
  await expect(body).toContainText("The open library");
  await body
    .locator("p")
    .first()
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
  await expect(page.locator(".mark-editor")).toBeVisible();
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  const anchor = await page.evaluate(
    () =>
      Object.values(
        JSON.parse(localStorage.getItem("mlibrary:v1")!).marks,
      )[0] as { anchor: { cfi: string } },
  );
  expect(anchor.anchor.cfi).toMatch(/^epubcfi\(/);
  expect(
    await page.locator(".epub-reader iframe").getAttribute("sandbox"),
  ).not.toContain("allow-scripts");
});

test("old shelves migrate, tags filter the library, and preferences survive Arabic mobile layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => {
    if (!localStorage.getItem("mlibrary:v1"))
      localStorage.setItem(
        "mlibrary:v1",
        JSON.stringify({
          version: 1,
          language: "en",
          shelf: {},
          activity: { "2026-11-01": 300 },
          dailyGoal: 25,
          settings: {
            theme: "sepia",
            mode: "page",
            fontSize: 22,
            lineHeight: 1.8,
            font: "serif",
          },
        }),
      );
  });
  await page.goto("/");
  await page.locator(".book-grid .book-open").first().click();
  await page.getByLabel("Organize this book").fill("weekend, research");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: /^My library/ }).click();
  await page.getByRole("button", { name: "#research", exact: true }).click();
  await expect(page.locator(".book-grid .book-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Reading journey", exact: true })
    .click();
  await page.getByRole("button", { name: "Poetry", exact: true }).click();
  await page.getByRole("button", { name: "Reflection", exact: true }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("ar");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("mlibrary:v1")!),
  );
  expect(state.dailyGoal).toBe(25);
  expect(state.activity["2026-11-01"]).toBe(300);
  expect(state.settings.theme).toBe("sepia");
  expect(state.preferences.genres).toContain("Poetry");
  expect(state.preferences.purposes).toContain("reflect");
  await page.screenshot({ path: "artifacts/preferences-arabic.png" });
});

test("unavailable editions never open a website and an imported copy opens in the app reader", async ({
  page,
}) => {
  const book = {
    id: "openlibrary:OL19999589W",
    title: "The Argonauts",
    authors: ["Maggie Nelson"],
    source: "openlibrary",
    language: "en",
    languages: ["en"],
    cover: null,
    sourceUrl: "https://openlibrary.org/works/OL19999589W",
    subjects: [],
    description: "",
    access: "borrow",
    rights: "Source-managed access",
    formats: [],
  };
  await page.route("**/api/search?**", (route) =>
    route.fulfill({
      json: { books: [book], sources: [], errors: [], hasMore: false, page: 1 },
    }),
  );
  await page.route("**/api/content?**", (route) =>
    route.fulfill({
      json: {
        type: "source",
        url: book.sourceUrl,
        available: false,
        message: "No readable edition",
        attribution: "Open Library",
      },
    }),
  );
  await page.route("https://openlibrary.org/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Source edition</h1>",
    }),
  );
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Search the catalogue" })
    .fill("Argonauts");
  await page
    .getByRole("textbox", { name: "Search the catalogue" })
    .press("Enter");
  await page.locator(".book-open").click();
  await page
    .getByRole("button", { name: "Open in reader", exact: true })
    .click();
  await expect(page.locator(".unavailable-edition")).toContainText(
    "A readable edition is needed",
  );
  await expect(page.locator(".reader iframe")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open source reader", exact: true }),
  ).toHaveCount(0);
  await page.locator(".unavailable-edition input[type=file]").setInputFiles({
    name: "My copy.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("This is my own readable copy. ".repeat(100)),
  });
  await expect(page.locator(".text-page")).toContainText(
    "This is my own readable copy.",
  );
  expect(page.context().pages()).toHaveLength(1);
});

test("download-only PDFs import automatically, support quotes, and reopen offline without redownloading", async ({
  page,
}) => {
  const book = {
    id: "archive:reader-fixture",
    title: "An online scanned edition",
    authors: ["MLibrary"],
    source: "archive",
    language: "en",
    languages: ["en"],
    cover: null,
    sourceUrl: "https://archive.org/details/reader-fixture",
    subjects: [],
    description: "",
    access: "source",
    rights: "Publicly available source file",
    formats: ["SCAN"],
  };
  await page.route("**/api/search?**", (route) =>
    route.fulfill({
      json: { books: [book], sources: [], errors: [], hasMore: false, page: 1 },
    }),
  );
  await page.route("**/api/content?**", (route) =>
    route.fulfill({
      json: {
        type: "remote",
        format: "pdf",
        url: "https://archive.org/download/reader-fixture/reader.pdf",
        attribution: "Source attribution",
      },
    }),
  );
  const pdf = rangedPdf();
  const ranges: number[] = [];
  await page.route("**/api/file?**", (route) => {
    const query = new URL(route.request().url()).searchParams;
    const start = Number(query.get("start")),
      end = Math.min(Number(query.get("end")) + 1, pdf.length);
    ranges.push(start);
    return route.fulfill({
      contentType: "application/octet-stream",
      headers: {
        "X-Book-Length": String(pdf.length),
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "X-Book-Length",
      },
      body: pdf.subarray(start, end),
    });
  });
  await page.goto("/");
  const search = page.getByRole("textbox", { name: "Search the catalogue" });
  await search.fill("scan");
  await search.press("Enter");
  await page.locator(".book-open").click();
  await page
    .getByRole("button", { name: "Open in reader", exact: true })
    .click();
  await expect(page.locator(".pdf-reader canvas")).toBeVisible();
  await expect(page.locator(".textLayer")).toContainText("MLibrary");
  await expect(page.locator(".reader iframe")).toHaveCount(0);
  expect(pdf.length).toBeGreaterThan(1048576);
  expect(ranges.some((start) => start > 0)).toBe(true);
  await selectText(page, ".textLayer");
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await expect(page.locator(".textLayer mark")).toHaveCount(1);
  await page.getByRole("button", { name: "Reading settings" }).click();
  await expect(
    page.getByRole("button", { name: "Saved offline", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Back to library" }).click();
  const downloads = ranges.length;
  await page.reload();
  await page.getByRole("button", { name: /^My library/ }).click();
  await page
    .locator('.book-open[aria-label="An online scanned edition"]')
    .click();
  await page.context().setOffline(true);
  await page
    .getByRole("button", { name: "Continue reading", exact: true })
    .click();
  await expect(page.locator(".textLayer")).toContainText("MLibrary");
  await expect(page.locator(".textLayer mark")).toHaveCount(1);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".textLayer")).toContainText("MLibrary page 2");
  expect(ranges).toHaveLength(downloads);
  await page.context().setOffline(false);
});
