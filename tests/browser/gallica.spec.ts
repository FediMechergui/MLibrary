import { test, expect } from "@playwright/test";

test("imported Gallica text is searchable, opens internally and saves for offline reading", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Our sources", exact: true }).click();
  const panel = page.locator('[data-source="gallica"]');
  await panel.getByRole("button", { name: "Search this library" }).click();
  await expect(page.locator(".book-grid .book-open").first()).toBeVisible();
  await expect(page.locator('select[aria-label="All sources"]')).toHaveValue(
    "gallica",
  );
  await page.getByRole("button", { name: "Our sources", exact: true }).click();
  await panel.locator("summary").click();
  await panel
    .getByLabel("Library book link")
    .fill("https://gallica.bnf.fr/ark:/12148/bpt6k5493777b");
  await panel.getByRole("button", { name: "Download & read" }).click();
  await expect(page.locator(".text-page")).toContainText(/GERMINAL|Germinal/);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("mlibrary:v1")!).shelf[
            "gallica:bpt6k5493777b"
          ]?.offline,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".page-indicator")).toContainText("Page 2");
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: /^My library/ }).click();
  await page.context().setOffline(true);
  await page.locator(".book-open").first().click();
  await page
    .getByRole("button", { name: "Continue reading", exact: true })
    .click();
  await expect(page.locator(".text-page")).not.toBeEmpty();
  await expect(page.locator(".page-indicator")).toContainText("Page 2");
  await page.context().setOffline(false);
});
