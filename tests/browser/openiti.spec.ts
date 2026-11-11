import { test, expect } from "@playwright/test";
test("long Arabic works download every section and navigate fully offline", async ({
  page,
}) => {
  const book = {
    id: "openiti:0001AbuTalibCabdManaf.Diwan.JK007501-ara1",
    title: "كتاب الاختبار",
    authors: ["كاتب"],
    language: "ar",
    languages: ["ar"],
    source: "openiti",
    sourceUrl: "https://github.com/OpenITI/RELEASE",
    cover: null,
    subjects: [],
    description: "",
    access: "read",
    formats: ["TXT"],
    rights: "OpenITI CC BY-NC-SA 4.0",
  };
  await page.route("**/api/search?**", (r) =>
    r.fulfill({
      json: { books: [book], sources: [], errors: [], hasMore: false, page: 1 },
    }),
  );
  const calls: string[] = [];
  await page.route("**/api/content?**", (r) => {
    const chapter =
      new URL(r.request().url()).searchParams.get("chapter") || "part-1";
    calls.push(chapter);
    return r.fulfill({
      json: {
        type: "text",
        text: (chapter === "part-1"
          ? "هذا هو القسم الأول من الكتاب. "
          : "هذا هو القسم الثاني من الكتاب. "
        ).repeat(100),
        chapter,
        chapters: [1, 2].map((i) => ({
          id: `part-${i}`,
          title: `الجزء ${i}`,
          url: book.sourceUrl,
        })),
        sourceUrl: book.sourceUrl,
        attribution: book.rights,
      },
    });
  });
  await page.goto("/");
  const search = page.getByRole("textbox", { name: "Search the catalogue" });
  await search.fill("اختبار");
  await search.press("Enter");
  await page.locator(".book-open").first().click();
  await page
    .getByRole("button", { name: "Start reading", exact: true })
    .click();
  await expect(page.locator(".text-page")).toContainText("القسم الأول");
  await page
    .getByRole("button", { name: "Reading settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Save offline", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Saved offline", exact: true }),
  ).toBeVisible();
  expect(calls).toContain("part-2");
  await page
    .getByRole("button", { name: "Contents & bookmarks", exact: true })
    .click();
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "الجزء 2", exact: true }).click();
  await expect(page.locator(".text-page")).toContainText("القسم الثاني");
  await page
    .getByRole("button", { name: "Contents & bookmarks", exact: true })
    .click();
  await page.getByRole("button", { name: "الجزء 1", exact: true }).click();
  await expect(page.locator(".text-page")).toContainText("القسم الأول");
  expect(calls.filter((c) => c === "part-2")).toHaveLength(1);
  await page.context().setOffline(false);
});
