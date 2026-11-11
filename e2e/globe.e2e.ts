import { expect, test, type Page } from "@playwright/test";

async function selectZone(page: Page, zone: string) {
  const search = page.getByRole("textbox", { name: "Search time zones" });
  await search.fill(zone.replaceAll("_", " "));
  await page
    .locator(".zone-results button")
    .filter({ hasText: zone.replaceAll("_", " ") })
    .click();
}

test("desktop globe renders, rotates, hovers, selects, and toggles boundaries", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "World clock and time zone converter" }),
  ).toBeVisible();
  await expect(page.locator("#hero-heading")).toHaveClass("sr-only");
  expect(
    await page
      .locator(".origin-time")
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThan(100);
  await expect(page.locator(".origin-time")).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".result-time")).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".comparison-summary")).toBeInViewport({
    ratio: 1,
  });
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".globe-status")).toHaveCount(0, {
    timeout: 20000,
  });
  await page.getByRole("button", { name: "Pause rotation" }).click();
  const canvas = await page.locator("canvas").boundingBox();
  if (!canvas) throw new Error("Missing globe canvas");
  await page.mouse.move(
    canvas.x + canvas.width * 0.5,
    canvas.y + canvas.height * 0.5,
  );
  await expect(page.locator(".hover-tooltip")).toBeVisible();
  await expect(page.locator(".result-time")).toHaveText(
    await page.locator(".hover-tooltip strong").innerText(),
  );
  await expect(page.locator(".conversion-result .clock-label")).toHaveText(
    "HOVER PREVIEW",
  );
  await page.mouse.move(10, 10);
  await expect(page.locator(".conversion-result .conversion-place")).toHaveText(
    "Tokyo",
  );
  await expect(page.locator(".conversion-result .clock-label")).toHaveText(
    "THEIR TIME",
  );
  await page.mouse.move(
    canvas.x + canvas.width * 0.5,
    canvas.y + canvas.height * 0.5,
  );
  const hoveredZone = await page
    .locator(".hover-tooltip > span")
    .first()
    .innerText();
  expect(hoveredZone.length).toBeGreaterThan(5);
  await page.mouse.click(
    canvas.x + canvas.width * 0.5,
    canvas.y + canvas.height * 0.5,
  );
  await expect(
    page.locator(".conversion-result .conversion-place"),
  ).not.toHaveText("Tokyo");
  await page.mouse.move(
    canvas.x + canvas.width * 0.5,
    canvas.y + canvas.height * 0.5,
  );
  await page.mouse.down();
  await page.mouse.move(
    canvas.x + canvas.width * 0.5 + 150,
    canvas.y + canvas.height * 0.5 + 40,
    { steps: 15 },
  );
  await page.mouse.up();
  const boundaries = page.getByRole("button", {
    name: "Toggle time-zone boundaries",
  });
  await boundaries.click();
  await expect(boundaries).toHaveAttribute("aria-pressed", "false");
  await boundaries.click();
  await expect(boundaries).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Reset globe view" }).click();
  await page.mouse.move(10, 10);
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: `${process.env.ARTIFACT_DIR || "test-results"}/meridian-desktop.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("conversion respects fractional zones, date rollover, home changes and DST errors", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator(".conversion-result .conversion-place").click();
  await selectZone(page, "Asia/Kathmandu");
  await page.getByLabel("Your date and time").fill("2026-01-15T23:30");
  await expect(page.locator(".result-time")).toContainText("04:15");
  await expect(
    page.locator(".conversion-result .comparison-date"),
  ).toContainText("Fri 16 Jan");
  await expect(page.locator(".day-offset")).toHaveText("+1 day");
  await expect(
    page.locator(".conversion-result .conversion-hint"),
  ).toContainText("UTC+5:45");
  await page.locator(".conversion-origin .conversion-place").click();
  await selectZone(page, "America/New_York");
  await expect(page.getByLabel("Your date and time")).toHaveValue(
    "2026-01-15T17:30",
  );
  await expect(page.locator(".result-time")).toContainText("04:15");
  await page.getByLabel("Your date and time").fill("2026-11-01T01:30");
  await expect(page.getByRole("alert")).toContainText("occurs twice");
  await expect(page.locator(".origin-time")).toHaveText("--:--");
  await expect(page.locator(".result-time")).toHaveText("--:--");
  await expect(
    page.getByRole("button", { name: "Copy converted time" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".live-switch")).toHaveClass(/is-live/);
});

test("clock labels change between EST EDT and CET CEST with the chosen date", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator(".conversion-result .conversion-place").click();
  await selectZone(page, "America/New_York");
  await page.getByLabel("Your date and time").fill("2026-01-15T12:00");
  await expect(page.locator(".conversion-origin .timezone-label")).toHaveText(
    "CET· UTC+1",
  );
  await expect(page.locator(".conversion-result .timezone-label")).toHaveText(
    "EST· UTC−5",
  );
  await expect(page.locator(".conversion-result abbr")).toHaveAttribute(
    "title",
    "Eastern Standard Time",
  );
  await page.getByLabel("Your date and time").fill("2026-07-15T12:00");
  await expect(page.locator(".conversion-origin .timezone-label")).toHaveText(
    "CEST· UTC+2",
  );
  await expect(page.locator(".conversion-result .timezone-label")).toHaveText(
    "EDT· UTC−4",
  );
  await expect(page.locator(".conversion-result abbr")).toHaveAttribute(
    "title",
    "Eastern Daylight Time",
  );
});

test("selected places show 9–5 status at the chosen time and update on add/remove", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("Your date and time").fill("2026-01-15T08:59");
  const tokyo = page.locator(".clock-card").filter({
    has: page.getByRole("button", { name: "Explore Tokyo", exact: true }),
  });
  await expect(tokyo.locator(".working-status")).toHaveText("Working · 9–5");
  await expect(page.locator(".working-summary strong")).toHaveText(
    "1 of 4 places in working hours at your selected time.",
  );
  await page.getByLabel("Your date and time").fill("2026-01-15T09:00");
  await expect(tokyo.locator(".working-status")).toHaveText("Outside 9–5");
  await expect(page.locator(".working-summary strong")).toHaveText(
    "0 of 4 places in working hours at your selected time.",
  );

  await page.getByRole("button", { name: "Add a place" }).click();
  await selectZone(page, "Asia/Kathmandu");
  await page.getByLabel("Your date and time").fill("2026-01-15T04:15");
  const kathmandu = page.locator(".clock-card").filter({
    has: page.getByRole("button", { name: "Explore Kathmandu", exact: true }),
  });
  await expect(kathmandu.locator(".city-time")).toHaveText("09:00");
  await expect(kathmandu.locator(".working-status")).toHaveText(
    "Working · 9–5",
  );
  await expect(page.locator(".working-summary strong")).toHaveText(
    "3 of 5 places in working hours at your selected time.",
  );
  await page.setViewportSize({ width: 320, height: 720 });
  await kathmandu.scrollIntoViewIfNeeded();
  await expect(kathmandu.locator(".working-status")).toBeVisible();
  expect(
    await kathmandu.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${process.env.ARTIFACT_DIR || "test-results"}/meridian-working-hours-mobile.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Remove Kathmandu" }).click();
  await expect(page.locator(".working-summary strong")).toHaveText(
    "2 of 4 places in working hours at your selected time.",
  );

  await page.locator(".conversion-origin .conversion-place").click();
  await selectZone(page, "America/New_York");
  await page.getByLabel("Your date and time").fill("2026-11-01T01:30");
  await expect(page.locator(".working-summary strong")).toHaveText(
    "Choose a valid date & time to check working hours.",
  );
  await expect(page.locator(".working-status.is-working")).toHaveCount(0);
  await expect(page.locator(".working-status").first()).toHaveText(
    "Time needs fixing",
  );
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(page.locator(".working-summary strong")).toContainText(
    "places in working hours now.",
  );
  await expect(page.locator(".working-status")).toHaveCount(4);
});

test("search, favorites and dialog keyboard interaction work without a mouse globe", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Add a place" }).click();
  await expect(
    page.getByRole("textbox", { name: "Search time zones" }),
  ).toBeFocused();
  await selectZone(page, "Asia/Singapore");
  await expect(
    page.getByRole("button", { name: "Explore Singapore", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove Singapore" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Explore Singapore", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "The perspective" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "The perspective" }),
  ).toBeFocused();
});

test("on-demand location sets the home zone without transmitting coordinates", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 40.7128, longitude: -74.006 });
  await page.goto("./");
  await page.getByRole("button", { name: "Find my place" }).click();
  await expect(
    page.locator(".conversion-origin .conversion-place"),
  ).toContainText("New York");
  await expect(page.locator(".notice")).toContainText(
    "Your location stays in your browser",
  );
});

test("mobile is responsive and tapping the globe selects a time zone", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    timezoneId: "Europe/Rome",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("./");
  await expect(page.locator(".origin-time")).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".result-time")).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".comparison-summary")).toBeInViewport({
    ratio: 1,
  });
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".globe-status")).toHaveCount(0, {
    timeout: 20000,
  });
  await page.locator("canvas").tap({ position: { x: 190, y: 205 } });
  await expect(
    page.locator(".conversion-result .conversion-place"),
  ).not.toHaveText("Tokyo");
  await expect(page.locator(".notice")).toContainText(/\d{2}:\d{2}.+UTC/);
  await page.getByRole("button", { name: "Find my place" }).click();
  await expect(page.locator(".notice")).toContainText(
    "Location permission was declined",
  );
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(
    page.locator(".conversion-origin .conversion-place"),
  ).toContainText("Rome");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${process.env.ARTIFACT_DIR || "test-results"}/meridian-mobile.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.locator(".conversion-result .conversion-place").click();
  await selectZone(page, "Asia/Tokyo");
  await page.getByLabel("Your date and time").fill("2026-01-15T23:30");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".origin-time")).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".result-time")).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".day-offset")).toHaveText("+1 day");
  const homeFontSize = await page
    .locator(".origin-time")
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  const destinationFontSize = await page
    .locator(".result-time")
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(homeFontSize).toBeGreaterThan(80);
  expect(homeFontSize).toBeGreaterThan(destinationFontSize * 1.7);
  for (const selector of [
    ".conversion-origin",
    ".conversion-result",
    ".moment-panel",
  ]) {
    expect(
      await page
        .locator(selector)
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await context.close();
});
