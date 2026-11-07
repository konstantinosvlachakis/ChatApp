import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1440, height: 720 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
  { width: 320, height: 700 },
]) {
  test(`learning-language picker stays in place at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/**", (route) => {
      const pathname = new URL(route.request().url()).pathname;
      return route.fulfill({
        status: pathname === "/api/profile/" ? 401 : 200,
        contentType: "application/json",
        body: JSON.stringify(pathname.includes("csrf") ? { csrfToken: "signup-test" } : {}),
      });
    });
    await page.goto("/register", { waitUntil: "networkidle" });
    const trigger = page.getByRole("button", { name: /I want to learn/ });
    await expect(trigger).toContainText("Choose at least one");
    // Put the field near the viewport bottom to exercise the upward-opening menu.
    await trigger.evaluate((element) => {
      window.scrollTo(0, Math.max(0, scrollY + element.getBoundingClientRect().top - (innerHeight - 100)));
    });
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const triggerBefore = await trigger.boundingBox();
    await trigger.click();
    const list = page.getByRole("listbox", { name: "I want to learn" });
    await expect(list).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    expect((await trigger.boundingBox())?.y).toBe(triggerBefore?.y);
    const menu = await list.locator("..").boundingBox();
    expect(menu?.y).toBeGreaterThanOrEqual(8);
    expect((menu?.y || 0) + (menu?.height || 0)).toBeLessThanOrEqual(viewport.height - 8);

    await list.press("End");
    expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    await list.press("Home");
    await list.press("Space");
    await expect(page.getByRole("option", { name: /Spanish/ })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("option", { name: /French/ }).click();
    await expect(page.getByRole("option", { name: /French/ })).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    await list.press("Tab");
    const done = page.getByRole("button", { name: "Done", exact: true });
    await expect(done).toBeFocused();
    await done.press("Shift+Tab");
    await expect(list).toBeFocused();
    await list.press("Tab");
    await done.press("Enter");
    await expect(trigger).toBeFocused();
    await expect(list).toBeHidden();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    await expect(page.getByRole("button", { name: /My level · Spanish/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /My level · French/ })).toBeVisible();
    await trigger.press("ArrowDown");
    await list.press("Tab");
    await done.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(list).toBeHidden();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    // Full-page screenshots may change the browser's scroll position; capture after the checks.
    await page.screenshot({ path: test.info().outputPath("multiple-languages.png"), fullPage: true });
    await trigger.click();
    await page.screenshot({ path: test.info().outputPath("language-menu.png"), fullPage: true });
  });
}
