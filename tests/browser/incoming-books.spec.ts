import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function nativeImports(page: Page, failStorage = false) {
  const pdf = await readFile("tests/fixtures/reader.pdf");
  await page.route("**/incoming-fixture.pdf", (route) =>
    route.fulfill({ contentType: "application/pdf", body: pdf }),
  );
  await page.addInitScript(
    ({ size, failStorage }) => {
      const w = window as any;
      const item = {
        id: "fixture",
        name: "QDL document.pdf",
        size,
        path: "file:///incoming-fixture.pdf",
        sourceUrl: "https://www.qdl.qa/en/archive/81055/test",
        title: "An imported document | Qatar Digital Library",
      };
      const callbacks: Record<string, Function> = {};
      w.incomingTest = {
        items: [item],
        completed: [] as string[],
        opened: [] as unknown[],
        failStorage,
        emit: () => callbacks.ready?.({}),
        emitError: () => callbacks.importError?.({}),
      };
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (w.incomingTest.failStorage && key === "mlibrary:v1")
          throw new DOMException("Full", "QuotaExceededError");
        setItem.call(this, key, value);
      };
      w.androidBridge = {};
      w.Capacitor = {
        convertFileSrc: () => "/incoming-fixture.pdf",
        PluginHeaders: ["BookImport", "App"].map((name) => ({
          name,
          methods: [
            ...["pending", "complete", "openQdl", "removeListener"].map(
              (name) => ({ name, rtype: "promise" }),
            ),
            { name: "addListener", rtype: "callback" },
          ],
        })),
        nativePromise: async (plugin: string, method: string, args: any) => {
          if (method === "pending") {
            if (w.incomingTest.pausePending)
              await new Promise((resolve) => {
                w.incomingTest.resumePending = resolve;
              });
            return { items: [...w.incomingTest.items] };
          }
          if (method === "complete") {
            const saved = JSON.parse(
              localStorage.getItem("mlibrary:v1") || "null",
            );
            if (
              !Object.values(saved?.shelf || {}).some(
                (entry: any) => entry.offline,
              )
            )
              throw new Error("Acknowledged before shelf persisted");
            w.incomingTest.completed.push(args.id);
            w.incomingTest.items = w.incomingTest.items.filter(
              (i: any) => i.id !== args.id,
            );
          }
          if (method === "openQdl") w.incomingTest.opened.push(args);
        },
        nativeCallback: (
          plugin: string,
          method: string,
          args: any,
          callback: Function,
        ) => {
          if (plugin === "BookImport" && method === "addListener")
            callbacks[args.eventName] = callback;
          return `${plugin}:${args.eventName}`;
        },
      };
    },
    { size: pdf.length, failStorage },
  );
}

test("native pending PDF imports, opens the reader, and acknowledges after storage", async ({
  page,
}) => {
  await nativeImports(page);
  await page.goto("/");
  await expect(page.locator(".pdf-page canvas").first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).incomingTest.completed.length),
    )
    .toBe(1);
  const shelf = await page.evaluate(
    () => JSON.parse(localStorage.getItem("mlibrary:v1")!).shelf,
  );
  expect(Object.values(shelf)).toMatchObject([
    {
      offline: true,
      book: {
        title: "An imported document",
        sourceUrl: "https://www.qdl.qa/en/archive/81055/test",
      },
    },
  ]);
  // A repeated Android share while the reader is open must reuse the same book.
  await page.evaluate(() => {
    const s = (window as any).incomingTest;
    s.items.push({
      id: "second",
      name: "same.pdf",
      size: 0,
      path: "file:///incoming-fixture.pdf",
    });
  });
  const size = (await readFile("tests/fixtures/reader.pdf")).length;
  await page.evaluate((size) => {
    const s = (window as any).incomingTest;
    s.items[0].size = size;
    s.emit();
  }, size);
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).incomingTest.completed.length),
    )
    .toBe(2);
  expect(
    await page.evaluate(
      () =>
        Object.keys(JSON.parse(localStorage.getItem("mlibrary:v1")!).shelf)
          .length,
    ),
  ).toBe(1);
});

test("failed shelf storage retains the native original and retry succeeds", async ({
  page,
}) => {
  await nativeImports(page, true);
  await page.goto("/");
  await expect(page.locator(".incoming-book [role=alert]")).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).incomingTest.completed),
  ).toEqual([]);
  await page.evaluate(() => {
    (window as any).incomingTest.failStorage = false;
  });
  await page
    .locator(".incoming-book")
    .getByRole("button", { name: "Retry", exact: true })
    .click();
  await expect(page.locator(".incoming-book")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).incomingTest.completed.length),
    )
    .toBe(1);
});

test("native rejection stays visible when a concurrent queue check finishes", async ({
  page,
}) => {
  await nativeImports(page);
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).incomingTest.completed.length),
    )
    .toBe(1);
  await page.evaluate(() => {
    const s = (window as any).incomingTest;
    s.pausePending = true;
    s.emit();
  });
  await expect
    .poll(() =>
      page.evaluate(() => typeof (window as any).incomingTest.resumePending),
    )
    .toBe("function");
  await page.evaluate(() => {
    const s = (window as any).incomingTest;
    s.emitError();
    s.pausePending = false;
    s.resumePending();
  });
  await expect(page.locator(".incoming-book [role=alert]")).toBeVisible();
  await page
    .locator(".incoming-book")
    .getByRole("button", { name: "Dismiss" })
    .click();
  await expect(page.locator(".incoming-book")).toHaveCount(0);
});

test("QDL browser launch accepts only publisher URLs and carries the app language", async ({
  page,
}) => {
  await nativeImports(page);
  await page.addInitScript(() => {
    (window as any).incomingTest.items = [];
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Our sources", exact: true }).click();
  const qdl = page.locator('[data-source="qdl"]');
  await qdl
    .getByLabel("QDL book URL (optional)")
    .fill("https://qdl.qa.evil.test/book");
  await qdl.getByRole("button", { name: "Browse & import PDF" }).click();
  await expect(qdl.getByRole("alert")).toHaveText(
    "Enter an HTTPS address from qdl.qa.",
  );
  await qdl
    .getByLabel("QDL book URL (optional)")
    .fill("https://www.qdl.qa/en/archive/81055/test");
  await qdl.getByRole("button", { name: "Browse & import PDF" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).incomingTest.opened))
    .toEqual([
      { url: "https://www.qdl.qa/en/archive/81055/test", language: "en" },
    ]);
});
