import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";
import { createHash } from "node:crypto";

const sample = (id = "local:backup-fixture") => ({
  version: 1,
  language: "en",
  shelf: {
    [id]: {
      book: {
        id,
        title: "My portable library",
        authors: ["Sample author"],
        language: "en",
        languages: ["en"],
        source: "local",
        sourceUrl: "",
        cover: null,
        subjects: [],
        description: "",
        access: "read",
        rights: "Personal test copy",
        formats: ["TXT"],
      },
      addedAt: 1000,
      status: "reading",
      offline: true,
      bookmarks: [],
      tags: ["test"],
    },
  },
  activity: { "2026-11-10": 120 },
  dailyGoal: 20,
  settings: {
    theme: "paper",
    mode: "flip",
    fontSize: 20,
    lineHeight: 1.8,
    font: "serif",
    highlightColor: "honey",
    focus: false,
  },
  marks: {},
  preferences: { genres: [], purposes: [], languages: ["en", "fr", "ar"] },
  sources: {},
});
async function panel(page: Page) {
  await page.route("**/api/search?**", (route) =>
    route.fulfill({
      json: {
        books: [],
        sources: [],
        errors: [],
        hasMore: false,
        page: 1,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: /^My library(?: \d+)?$/ })
    .first()
    .click();
  await page.getByRole("button", { name: /Backup & device sync/ }).click();
}
test("backup preview restores actual offline text, exports it again and rejects corrupt files without changing the library", async ({
  page,
}) => {
  const state = sample(),
    id = Object.keys(state.shelf)[0];
  const content = Buffer.from(
    JSON.stringify({
      type: "text",
      text: "A book that travels with its reader. ".repeat(200),
      chapters: [],
      sourceUrl: "",
      attribution: "",
    }),
  );
  const hash = createHash("sha256").update(content).digest("hex");
  const zip = new JSZip();
  zip.file(`books/${hash}.bin`, content);
  zip.file(
    "library.json",
    JSON.stringify({
      format: "mlibrary-backup",
      version: 1,
      state,
      files: [
        {
          id,
          path: `books/${hash}.bin`,
          size: content.length,
          hash,
          type: "text",
        },
      ],
    }),
  );
  await panel(page);
  await page
    .getByLabel("Restore backup", { exact: true })
    .setInputFiles({
      name: "backup.zip",
      mimeType: "application/zip",
      buffer: await zip.generateAsync({ type: "nodebuffer" }),
    });
  await expect(page.getByRole("dialog")).toContainText(
    "1 books · 0 notes · 1 offline files",
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("mlibrary:v1") || "{}").shelf || {},
    ),
  ).toEqual({});
  await page.getByRole("button", { name: "Merge this backup" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".book-card")).toContainText("My portable library");
  const saved = await page.evaluate(async (id) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const r = indexedDB.open("keyval-store");
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
    return new Promise<any>((resolve, reject) => {
      const r = db
        .transaction("keyval")
        .objectStore("keyval")
        .get(`book:${id}`);
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
  }, id);
  expect(saved.text).toContain("travels with its reader");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const output = await download;
  expect(output.suggestedFilename()).toMatch(/MLibrary-backup-.*zip/);
  const before = await page.evaluate(() => localStorage.getItem("mlibrary:v1"));
  zip.file(`books/${hash}.bin`, Buffer.from("tampered"));
  await page
    .getByLabel("Restore backup", { exact: true })
    .setInputFiles({
      name: "damaged.zip",
      mimeType: "application/zip",
      buffer: await zip.generateAsync({ type: "nodebuffer" }),
    });
  await expect(page.getByRole("alert")).toContainText("damaged");
  expect(
    await page.evaluate(() => localStorage.getItem("mlibrary:v1")),
  ).toEqual(before);
});
test("two devices pair through encrypted sync, preserve local files and propagate removals", async ({
  page,
  browser,
}) => {
  await page.addInitScript(
    (state) => localStorage.setItem("mlibrary:v1", JSON.stringify(state)),
    sample(),
  );
  await panel(page);
  await page
    .getByRole("button", { name: "Create a sync key", exact: true })
    .click();
  const key = await page
    .getByLabel("Recovery key", { exact: true })
    .inputValue();
  await page.getByRole("checkbox", { name: /I saved this key/ }).check();
  const uploaded: Buffer[] = [];
  let conflicted = false;
  await page.route("**/api/vault/*", (route) => {
    if (route.request().method() === "PUT" && !conflicted) {
      conflicted = true;
      return route.fulfill({
        status: 409,
        json: { error: "Concurrent update" },
      });
    }
    return route.continue();
  });
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().includes("/api/vault/"))
      uploaded.push(r.postDataBuffer()!);
  });
  await page.getByRole("button", { name: "Enable sync", exact: true }).click();
  await expect(page.getByText(/Last synced:/)).toBeVisible();
  expect(uploaded.length).toBeGreaterThan(1);
  expect(uploaded[0].subarray(0, 4).toString()).toBe("MLV1");
  expect(uploaded[0].toString()).not.toContain("My portable library");
  const context = await browser.newContext({
      baseURL: new URL(page.url()).origin,
    }),
    second = await context.newPage();
  await panel(second);
  await second
    .getByRole("button", { name: "Connect another device", exact: true })
    .click();
  await second.getByLabel("Recovery key", { exact: true }).fill(key);
  await second.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(second.locator(".book-card")).toContainText(
    "My portable library",
  );
  expect(
    await second.evaluate(
      () =>
        JSON.parse(localStorage.getItem("mlibrary:v1")!).shelf[
          "local:backup-fixture"
        ].offline,
    ),
  ).toBe(false);
  await second
    .getByRole("button", { name: "Delete cloud copy", exact: true })
    .click();
  await second
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(
    second.getByRole("button", { name: "Create a sync key", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Disconnect this device", exact: true })
    .click();
  await context.close();
});
test("restore rolls back replaced book files when metadata storage fails", async ({
  page,
}) => {
  const state = sample(),
    id = Object.keys(state.shelf)[0];
  const content = Buffer.from(
    JSON.stringify({
      type: "text",
      text: "Replacement text",
      chapters: [],
      sourceUrl: "",
      attribution: "",
    }),
  );
  const hash = createHash("sha256").update(content).digest("hex"),
    zip = new JSZip();
  zip.file(`books/${hash}.bin`, content);
  zip.file(
    "library.json",
    JSON.stringify({
      format: "mlibrary-backup",
      version: 1,
      state,
      files: [
        {
          id,
          path: `books/${hash}.bin`,
          size: content.length,
          hash,
          type: "text",
        },
      ],
    }),
  );
  await panel(page);
  await page.evaluate(async (id) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const r = indexedDB.open("keyval-store");
      r.onupgradeneeded = () => r.result.createObjectStore("keyval");
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("keyval", "readwrite");
      tx.objectStore("keyval").put(
        { type: "text", text: "Original copy" },
        `book:${id}`,
      );
      tx.oncomplete = () => resolve();
      tx.onerror = reject;
    });
    db.close();
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "mlibrary:v1")
        throw new DOMException("Storage full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  }, id);
  await page
    .getByLabel("Restore backup", { exact: true })
    .setInputFiles({
      name: "backup.zip",
      mimeType: "application/zip",
      buffer: await zip.generateAsync({ type: "nodebuffer" }),
    });
  await page.getByRole("button", { name: "Merge this backup" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Storage full",
  );
  const text = await page.evaluate(async (id) => {
    const db: IDBDatabase = await new Promise((resolve) => {
      const r = indexedDB.open("keyval-store");
      r.onsuccess = () => resolve(r.result);
    });
    return new Promise<string>((resolve) => {
      const r = db
        .transaction("keyval")
        .objectStore("keyval")
        .get(`book:${id}`);
      r.onsuccess = () => {
        resolve(r.result.text);
        db.close();
      };
    });
  }, id);
  expect(text).toBe("Original copy");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("mlibrary:v1") || "{}").shelf || {},
    ),
  ).toEqual({});
});
test("backup validation rejects prototype keys before preview and fits Arabic mobile width", async ({
  page,
}) => {
  await panel(page);
  await page
    .getByLabel("Restore backup", { exact: true })
    .setInputFiles({
      name: "unsafe.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":1,"__proto__":{"polluted":true}}'),
    });
  await expect(page.getByRole("alert")).toContainText("Invalid library backup");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate((state) => {
    state.language = "ar";
    localStorage.setItem("mlibrary:v1", JSON.stringify(state));
  }, sample());
  await page.reload();
  await page
    .getByRole("button", { name: /^مكتبتي/ })
    .first()
    .click();
  await page.getByRole("button", { name: /النسخ الاحتياطي والمزامنة/ }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
