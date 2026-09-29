import { test, expect, Page } from "@playwright/test";

const SAMPLE_URL = "https://www.youtube.com/@veritasium";

async function analyzeChannel(page: Page, url: string) {
  await page.goto("/", { timeout: 120000, waitUntil: "load" });
  const input = page.getByLabel("YouTube channel or video URL");
  await input.waitFor({ state: "visible", timeout: 60000 });
  await input.fill(url);
  const button = page.getByRole("button", { name: "Analyze channel" });
  await button.waitFor({ state: "visible", timeout: 60000 });
  await page.waitForFunction(
    () => {
      const b = document.querySelector("button[type=submit]");
      return b instanceof HTMLButtonElement && !b.disabled;
    },
    null,
    { timeout: 45000 },
  );
  await button.click();
  await page.waitForURL(/\/reports\/[0-9a-f-]{36}/, { timeout: 120000 });
  return page;
}

test.describe("TruthLens primary journey", () => {
  test("analyze → inspect → decide → agent → export → delete", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    const reportPage = await analyzeChannel(page, SAMPLE_URL);

    await expect(reportPage.getByText("Factor breakdown")).toBeVisible({ timeout: 45000 });
    await expect(reportPage.getByText("Refraction — one signal, six factors")).toBeVisible();
    const scoreText = await reportPage.locator("svg[role='img'][aria-label*='Credibility score']").first().isVisible();
    expect(scoreText).toBe(true);

    await reportPage
      .locator('button[aria-expanded]')
      .filter({ hasText: "Claim discipline" })
      .click();
    await expect(reportPage.getByText("Evidence — matched phrases")).toBeVisible();

    await reportPage.getByLabel("Your note").fill("smoke test note");
    await reportPage.getByRole("button", { name: "Save note" }).click();
    await expect(reportPage.getByRole("button", { name: "Saved" })).toBeVisible({ timeout: 40000 });

    await reportPage.getByRole("button", { name: "Worth your time" }).first().click();

    await page.goto("/agent");
    await page.getByRole("button", { name: /initialize/ }).click();
    await expect(page.getByText("2024-11-05").first()).toBeVisible({ timeout: 40000 });

    await page.getByRole("button", { name: /tools\/list/ }).click();
    await expect(page.getByText("verify_integrity").last()).toBeVisible({ timeout: 30000 });

    await page.getByRole("button", { name: /verify integrity/ }).click();
    await expect(page.getByText(/Integrity chain verified/)).toBeVisible({ timeout: 45000 });

    const exportPromise = page.waitForEvent("download", { timeout: 30000 });
    await page.goto("/export");
    await page.locator('a:has-text("JSON")').first().click();
    const download = await exportPromise;
    expect(download.suggestedFilename()).toContain("truthlens-");

    await page.goto("/reports");
    const card = page.locator("a[href*='/reports/']").first();
    const href = await card.getAttribute("href");
    expect(href).toMatch(/\/reports\/[0-9a-f-]{36}/);

    await page.goto(href!);
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(/\/reports(\?.*)?$/, { timeout: 60000 });
    await expect(page.getByText("No reports yet")).toBeVisible({ timeout: 60000 });

    const realErrors = consoleErrors.filter(
      (e) => !e.includes("favicon") && !e.includes("Download the React DevTools"),
    );
    expect(realErrors).toEqual([]);
  });

  test("navigation and footer link to the public repository", async ({ page }) => {
    await page.goto("/");
    const headerLink = page.locator("header a[aria-label='Star on GitHub']");
    await expect(headerLink).toBeVisible();
    expect(await headerLink.getAttribute("href")).toBe(
      "https://github.com/aniruddhaadak80/truthlens",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Toggle navigation menu" }).click();
    await expect(page.locator(`nav[aria-label='Mobile'] a:has-text("Agent")`)).toBeVisible();
    await page.getByRole("button", { name: "Toggle navigation menu" }).click();

    await page.setViewportSize({ width: 1440, height: 900 });
    const footerLink = page.locator("footer a:has-text('View source on GitHub')");
    await expect(footerLink).toBeVisible();
    expect(await footerLink.getAttribute("href")).toBe(
      "https://github.com/aniruddhaadak80/truthlens",
    );
  });

  test("validation and empty states are truthful", async ({ page }) => {
    await page.goto("/", { timeout: 120000, waitUntil: "load" });
    await expect(page.getByRole("button", { name: "Analyze channel" })).toBeDisabled();
    const input = page.getByLabel("YouTube channel or video URL");
    await input.waitFor({ state: "visible", timeout: 60000 });
    await input.fill("not a youtube link");
    await page.waitForFunction(
      () => {
        const b = document.querySelector("button[type=submit]");
        return b instanceof HTMLButtonElement && !b.disabled;
      },
      null,
      { timeout: 45000 },
    );
    await page.getByRole("button", { name: "Analyze channel" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("does not look like a YouTube", { timeout: 60000 });

    await page.goto("/reports");
    await expect(page.getByText("No reports yet")).toBeVisible();
  });
});
