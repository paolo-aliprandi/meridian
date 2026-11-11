import { expect, test, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";

async function selectZone(page: Page, zone: string) {
  const search = page.getByRole("textbox", { name: "Search time zones" });
  await search.fill(zone.replaceAll("_", " "));
  await page
    .locator(".zone-results button")
    .filter({ hasText: zone.replaceAll("_", " ") })
    .click();
}

async function prepareBorderDrag(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const outlines = page.waitForResponse((response) =>
    response.url().endsWith("/timezones.geojson"),
  );
  await page.goto("./");
  await outlines;
  await expect(page.locator(".globe-status")).toHaveCount(0, {
    timeout: 20000,
  });
  await page.getByRole("button", { name: "Pause rotation" }).click();
  await page.getByRole("button", { name: "Reset globe view" }).click();
  const rect = await page.locator("canvas").boundingBox();
  if (!rect) throw new Error("Missing globe canvas");
  const vector = (lat: number, lon: number, radius: number) =>
    new Vector3(
      radius *
        Math.cos((lat * Math.PI) / 180) *
        Math.cos((lon * Math.PI) / 180),
      radius * Math.sin((lat * Math.PI) / 180),
      -radius *
        Math.cos((lat * Math.PI) / 180) *
        Math.sin((lon * Math.PI) / 180),
    );
  const camera = new PerspectiveCamera(36, rect.width / rect.height, 0.1, 100);
  camera.position.copy(vector(23, 24, 3.55));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return async (lat: number, lon: number) => {
    const projected = vector(lat, lon, 1.004).project(camera);
    const point = {
      x: rect.x + ((projected.x + 1) * rect.width) / 2,
      y: rect.y + ((1 - projected.y) * rect.height) / 2,
    };
    await page.mouse.move(point.x, point.y);
    return point;
  };
}

async function globePixel(page: Page, point: { x: number; y: number }) {
  const image = await page.screenshot({
    clip: {
      x: Math.floor(point.x) - 3,
      y: Math.floor(point.y) - 3,
      width: 7,
      height: 7,
    },
  });
  return page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 7;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 7, 7).data;
    const color = { r: 0, g: 0, b: 0 };
    for (let i = 0; i < pixels.length; i += 4) {
      color.r += pixels[i];
      color.g += pixels[i + 1];
      color.b += pixels[i + 2];
    }
    return { r: color.r / 49, g: color.g / 49, b: color.b / 49 };
  }, image.toString("base64"));
}

test("globe colors distinguish working hours, update at 17:00, and neutralize invalid time", async ({
  page,
}) => {
  const move = await prepareBorderDrag(page);
  await move(25, -5);
  await page.mouse.down();
  await move(25, 25);
  await page.mouse.up();
  const algiers = page.locator(".clock-card").filter({
    has: page.getByRole("button", { name: "Explore Algiers", exact: true }),
  });
  const tripoli = page.locator(".clock-card").filter({
    has: page.getByRole("button", { name: "Explore Tripoli", exact: true }),
  });
  await page.getByLabel("Your date and time").fill("2026-01-15T16:59");
  await expect(algiers).toHaveClass(/clock-working/);
  await expect(tripoli).toHaveClass(/clock-off-hours/);
  await expect(
    page.getByRole("group", { name: "Time-zone highlight colors" }),
  ).toContainText("Working 9–5");
  const workingPixel = await move(27, 3);
  const offHoursPixel = await move(27, 15);
  await page.mouse.move(10, 10);
  await expect
    .poll(async () => {
      const color = await globePixel(page, workingPixel);
      return color.g - color.r;
    })
    .toBeGreaterThan(10);
  const offHours = await globePixel(page, offHoursPixel);
  expect(offHours.r - offHours.g).toBeGreaterThan(10);
  await page.getByLabel("Your date and time").fill("2026-01-15T17:00");
  await expect(algiers).toHaveClass(/clock-off-hours/);
  await expect
    .poll(async () => {
      const color = await globePixel(page, workingPixel);
      return color.r - color.g;
    })
    .toBeGreaterThan(10);
  const outside = await globePixel(page, workingPixel);
  const outsideChroma =
    Math.max(outside.r, outside.g, outside.b) -
    Math.min(outside.r, outside.g, outside.b);
  await page.getByLabel("Your date and time").fill("2026-03-29T02:30");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(algiers).not.toHaveClass(/clock-working|clock-off-hours/);
  await expect(page.locator(".globe-zone-legend")).toHaveText(
    "Fix time to color zones",
  );
  await expect(page.locator(".notice")).toHaveCount(0);
  await expect
    .poll(async () => {
      const color = await globePixel(page, workingPixel);
      return (
        Math.max(color.r, color.g, color.b) -
        Math.min(color.r, color.g, color.b)
      );
    })
    .toBeLessThan(outsideChroma / 2);
});

test("border dragging previews, shrinks, reverses and compares selected zones", async ({
  page,
}) => {
  const move = await prepareBorderDrag(page);
  const hint = page.locator(".border-drag-hint");
  // Visible borders across northern Africa, in the initial globe view.
  await move(25, -5);
  await expect(page.locator("canvas")).toHaveCSS("cursor", "ew-resize");
  await expect(hint).toHaveText("Drag this border to select time zones");
  await page.mouse.down();
  await move(25, 25);
  await expect(hint).toContainText("snapped to border");
  const count = Number((await hint.innerText()).match(/^\d+/)![0]);
  expect(count).toBeGreaterThan(1);
  const anchor = await page
    .locator(".range-overlay circle")
    .first()
    .getAttribute("cx");
  await move(28, 10);
  await expect(hint).toContainText("snapped to border");
  expect(Number((await hint.innerText()).match(/^\d+/)![0])).toBeLessThan(
    count,
  );
  await move(25, 25);
  await expect(page.locator(".range-overlay circle").first()).toHaveAttribute(
    "cx",
    anchor!,
  );
  await page.mouse.up();
  await expect(page.locator(".range-overlay")).toHaveCount(0);
  await expect(page.locator(".clock-card")).toHaveCount(count);
  const cities = await page.locator(".clock-city").allTextContents();
  expect(cities).toEqual(expect.arrayContaining(["Algiers", "Tripoli"]));
  expect(cities).not.toContain("Tokyo");
  await page.getByLabel("Your date and time").fill("2026-01-15T12:00");
  await expect(page.locator(".working-status.is-working")).toHaveCount(count);
  await expect(page.locator(".range-result")).toHaveText(
    `${count} zones · ${count} in 9–5`,
  );
  await move(25, 25);
  await page.mouse.down();
  await move(25, -5);
  await page.mouse.up();
  await expect(page.locator(".clock-card")).toHaveCount(count);
  expect((await page.locator(".clock-city").allTextContents()).sort()).toEqual(
    cities.sort(),
  );
  await page.getByRole("button", { name: "Clear zone selection" }).click();
  await expect(page.locator(".clock-card")).toHaveCount(0);
  await expect(page.locator(".range-result")).toHaveCount(0);
});

test("border selection cancels cleanly and leaves ordinary rotation available", async ({
  page,
}) => {
  const move = await prepareBorderDrag(page);
  for (const cancel of ["escape", "pointercancel", "outside"]) {
    await move(25, -5);
    await page.mouse.down();
    await move(25, 25);
    await expect(page.locator(".range-overlay")).toBeVisible();
    if (cancel === "escape") await page.keyboard.press("Escape");
    else if (cancel === "pointercancel")
      await page.locator("canvas").dispatchEvent("pointercancel");
    else await page.mouse.move(10, 10);
    await page.mouse.up();
    await expect(page.locator(".range-overlay")).toHaveCount(0);
    await expect(page.locator(".clock-card")).toHaveCount(4);
    await expect(page.locator(".range-result")).toHaveCount(0);
  }
  await page
    .getByRole("button", { name: "Toggle time-zone boundaries" })
    .click();
  await move(25, -5);
  await expect(page.locator("canvas")).toHaveCSS("cursor", "grab");
  await expect(page.locator(".border-drag-hint")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Toggle time-zone boundaries" })
    .click();
  await move(25, 0);
  await expect(page.locator("canvas")).toHaveCSS("cursor", "grab");
  const before = await page
    .locator(".hover-tooltip > span")
    .first()
    .innerText();
  await page.mouse.down();
  // A normal drag away from a border must still rotate, not select zones.
  await page.mouse.move(1050, 440, { steps: 10 });
  await page.mouse.up();
  await page.mouse.move(10, 10);
  await page.waitForTimeout(1000);
  await move(25, 0);
  await expect(page.locator(".hover-tooltip > span").first()).not.toHaveText(
    before,
  );
  await expect(page.locator(".clock-card")).toHaveCount(4);
  await expect(page.locator(".range-result")).toHaveCount(0);
});

test("search metadata, sitemap and social preview are served without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL!);
  const canonical = "https://paolo-aliprandi.github.io/meridian/";
  await expect(page.locator("link[rel=canonical]")).toHaveAttribute(
    "href",
    canonical,
  );
  await expect(page.locator("meta[name=robots]")).toHaveAttribute(
    "content",
    /index, follow/,
  );
  await expect(page.locator("meta[property='og:url']")).toHaveAttribute(
    "content",
    canonical,
  );
  await page
    .getByText("World clock, time zone converter & 9–5 checker", {
      exact: true,
    })
    .click();
  await expect(page.locator(".site-description")).toContainText("09:00–17:00");
  await expect(page.locator("noscript p")).toBeVisible();
  expect(await page.locator("noscript p").textContent()).toContain(
    "Enable JavaScript",
  );
  const structuredData = JSON.parse(
    (await page.locator("script[type='application/ld+json']").textContent())!,
  );
  expect(structuredData["@type"]).toBe("WebApplication");
  expect(structuredData.url).toBe(canonical);
  const sitemap = await page.request.get(new URL("sitemap.xml", baseURL!).href);
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain(`<loc>${canonical}</loc>`);
  const robots = await page.request.get(new URL("robots.txt", baseURL!).href);
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain(`${canonical}sitemap.xml`);
  const previewURL = await page
    .locator("meta[property='og:image']")
    .getAttribute("content");
  expect(previewURL).toBe(`${canonical}social-preview.png`);
  const preview = await page.request.get(
    new URL("social-preview.png", baseURL!).href,
  );
  expect(preview.status()).toBe(200);
  expect(preview.headers()["content-type"]).toContain("image/png");
  const image = await preview.body();
  expect(image.readUInt32BE(16)).toBe(1200);
  expect(image.readUInt32BE(20)).toBe(630);
  await context.close();
});

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
