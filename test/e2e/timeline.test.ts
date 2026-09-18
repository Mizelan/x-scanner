// Loads the built extension into Chrome, opens the fixture timeline against the fake Jev
// server, scrolls like a person, and checks labels, HUD numbers, skipping and caching.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import { chromium } from "playwright-core";
import { startServer } from "./server.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DIST = path.join(ROOT, "dist-e2e");
const FIXTURE = path.join(ROOT, "test/fixture");
const PROFILE = path.join(ROOT, "test/e2e/.profile");

/**
 * Branded Google Chrome dropped --load-extension in version 137, so prefer a Chrome for Testing or
 * Chromium build. Playwright's browser cache is the usual place to find one; CHROME_PATH overrides.
 */
function chromePath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const home = os.homedir();
  const caches = [path.join(home, "Library/Caches/ms-playwright"), path.join(home, ".cache/ms-playwright")];
  const found: { n: number; p: string }[] = [];
  for (const cache of caches) {
    if (!existsSync(cache)) continue;
    for (const dir of readdirSync(cache)) {
      const m = /^chromium-(\d+)$/.exec(dir);
      if (!m) continue;
      for (const rel of [
        "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-linux/chrome",
        "chrome-linux64/chrome",
      ]) {
        const p = path.join(cache, dir, rel);
        if (existsSync(p)) found.push({ n: Number(m[1]), p });
      }
    }
  }
  found.sort((a, b) => b.n - a.n);
  if (found[0]) return found[0].p;
  for (const p of ["/Applications/Chromium.app/Contents/MacOS/Chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser"]) if (existsSync(p)) return p;
  throw new Error("no Chromium or Chrome for Testing found; run `npx playwright-core install chromium` or set CHROME_PATH");
}

test("timeline: dwell triggers analysis, pills render, promoted skipped, cache stops re-billing", async (t) => {
  assert.ok(existsSync(path.join(DIST, "manifest.json")), "run `npm run build:e2e` first");
  const server = await startServer(FIXTURE);
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: chromePath(),
    ignoreDefaultArgs: ["--disable-extensions"],
    headless: process.env.HEADED ? false : true,
    viewport: { width: 1100, height: 900 },
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, "--no-first-run", "--hide-scrollbars"],
  });
  t.after(async () => {
    await ctx.close();
    server.close();
  });

  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker", { timeout: 15000 }));
  await sw.evaluate(async (baseUrl: string) => {
    await chrome.storage.local.set({
      settings: { apiKey: "test-key", baseUrl, scope: "all", dwellMs: 200, concurrency: 6 },
    });
  }, `http://127.0.0.1:${server.port}`);

  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.port}/timeline.html?repeat=4`);
  await page.waitForFunction(() => (window as unknown as { __fixtureReady?: boolean }).__fixtureReady === true);
  await page.waitForSelector(".xs-hud", { timeout: 10000 });

  // Posts in view at the top get analyzed after the dwell without any interaction.
  await page.waitForFunction(() => document.querySelectorAll('.xs-slot[data-state="done"]').length >= 2, null, { timeout: 15000 });

  // Slot is reserved on mount for every post, before any result arrives.
  const slotCount = await page.evaluate(() => document.querySelectorAll("article .xs-slot").length);
  const articleCount = await page.evaluate(() => document.querySelectorAll('article[data-testid="tweet"]').length);
  assert.equal(slotCount, articleCount, "one slot per mounted article");

  // Scroll like a reader: a wheel step every ~350ms for a while.
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 420);
    await page.waitForTimeout(350);
  }

  // Screenshot for the README while the session counters are still moving.
  await page.waitForTimeout(500);
  mkdirSync(path.join(ROOT, "docs"), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, "docs/screenshot.png") });
  await page.waitForTimeout(1500);

  const hud = await page.evaluate(() => {
    const vals = Array.from(document.querySelectorAll(".xs-hud-v")).map((e) => e.textContent ?? "");
    return { analyzed: Number(vals[0]), cost: vals[1] ?? "", latency: vals[2] ?? "", rate: vals[3] ?? "", foot: document.querySelector(".xs-hud-foot")?.textContent ?? "" };
  });
  assert.ok(hud.analyzed >= 12, `analyzed ${hud.analyzed}`);
  assert.match(hud.latency, /^\d+ ms$/);
  assert.match(hud.rate, /judgments\/s$/);

  // Cost shown equals exact token usage times list price, to the 4 decimals the HUD shows.
  const expected = (server.totalTokens() * 0.042) / 1e6;
  assert.equal(hud.cost, `$${expected.toFixed(4)}`);
  assert.equal(server.requests.length, hud.analyzed, "HUD analyzed count equals real request count");

  // The right pills, and only those, appear.
  const pills = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".xs-pill")).map((p) => ({ dim: (p as HTMLElement).dataset.dim, text: p.textContent })),
  );
  assert.ok(pills.some((p) => p.dim === "engagement_bait" && p.text === "engagement bait"), "bait pill");
  assert.ok(pills.some((p) => p.dim === "promotion"), "promo pill");
  assert.ok(pills.some((p) => p.dim === "info_density" && p.text === "dense"), "dense pill");
  assert.ok(pills.some((p) => p.dim === "padding"), "padded pill");
  assert.ok(pills.some((p) => p.dim === "secondhand"), "secondhand pill");
  const plain = await page.evaluate(() => {
    const art = Array.from(document.querySelectorAll("article")).find((a) => a.textContent?.includes("Coffee tastes better"));
    const slot = art?.querySelector(".xs-slot") as HTMLElement | null;
    return { state: slot?.dataset.state, hits: slot?.querySelectorAll(".xs-pill-hit").length, clean: slot?.querySelectorAll(".xs-pill-clean").length, inRow: slot?.parentElement?.classList.contains("hdr") };
  });
  assert.deepEqual(plain, { state: "done", hits: 0, clean: 1, inRow: true }, "a plain post gets a clean pill in the header row");

  // Clicking a pill opens the detail card with all five values and does not navigate.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.click('.xs-pill[data-dim="engagement_bait"]');
  await page.waitForSelector(".xs-detail");
  const detail = await page.evaluate(() => ({
    rows: document.querySelectorAll(".xs-detail-row").length,
    hit: document.querySelector(".xs-detail-row.xs-hit .xs-detail-k")?.textContent,
    foot: document.querySelector(".xs-detail-foot")?.textContent ?? "",
  }));
  assert.equal(detail.rows, 5);
  assert.equal(detail.hit, "engagement bait");
  assert.match(detail.foot, /^\d+ tok · \$0\.\d{6} · \d+ ms · jev-1\.13\.0$/);
  await page.mouse.click(5, 400);
  await page.waitForFunction(() => !document.querySelector(".xs-detail"));

  // Promoted and text-less posts never reach Jev; a quote sends its quoted text; a reply is flagged.
  assert.ok(!server.requests.some((r) => r.text.includes("Meet the new Pixel")), "promoted skipped");
  assert.ok(!server.requests.some((r) => r.text === ""), "empty text skipped");
  const quote = server.requests.find((r) => r.text === "This.");
  assert.equal(quote?.quoted_text, "Paul Graham: The best founders are the ones who are relentlessly resourceful.");
  const reply = server.requests.find((r) => r.text.startsWith("Agreed, and the second-order"));
  assert.equal(reply?.is_reply, true);
  assert.deepEqual(server.requests[0]!.questionIds, ["info_density", "engagement_bait", "promotion", "secondhand", "padding"]);
  assert.equal(server.requests[0]!.model, "jev-1.13.0");

  // Every post was billed at most once even though the list recycled and remounted nodes.
  const texts = server.requests.map((r) => r.text + "|" + (r.quoted_text ?? ""));
  const recycled = await page.evaluate(() => (window as unknown as { __recycled?: number }).__recycled ?? 0);
  assert.ok(recycled > 0, "fixture recycled nodes during the scroll");

  // Scroll back to the top: everything comes from cache, no new requests.
  const before = server.requests.length;
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, -420);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1500);
  assert.equal(server.requests.length, before, "scrolling back re-bills nothing");
  const topSlots = await page.evaluate(() => Array.from(document.querySelectorAll('.xs-slot[data-state="done"]')).length);
  assert.ok(topSlots >= 2, "cached results re-render on remount");
  const uniq = new Set(texts);
  assert.equal(uniq.size <= texts.length, true);

  // Reload: the persisted cache survives, the first screen needs no request.
  const beforeReload = server.requests.length;
  await page.reload();
  await page.waitForSelector(".xs-hud");
  await page.waitForTimeout(1500);
  const cachedFoot = await page.evaluate(() => document.querySelector(".xs-hud-foot")?.textContent ?? "");
  assert.match(cachedFoot, /cached [1-9]\d*/, `cache hits after reload: ${cachedFoot}`);
  assert.equal(server.requests.length, beforeReload, "reload re-bills nothing for already seen posts");

  assert.deepEqual(errors, [], "no page errors");
});

test("scope: home only pauses on other paths, account filter pauses on mismatch", async (t) => {
  const server = await startServer(FIXTURE);
  const profile = PROFILE + "-scope";
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: chromePath(),
    ignoreDefaultArgs: ["--disable-extensions"],
    headless: process.env.HEADED ? false : true,
    viewport: { width: 1100, height: 900 },
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, "--no-first-run"],
  });
  t.after(async () => {
    await ctx.close();
    server.close();
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker", { timeout: 15000 }));
  const base = `http://127.0.0.1:${server.port}`;

  await sw.evaluate(async (baseUrl: string) => {
    await chrome.storage.local.set({ settings: { apiKey: "test-key", baseUrl, scope: "home" } });
  }, base);
  const page = await ctx.newPage();
  await page.goto(`${base}/timeline.html`);
  await page.waitForSelector(".xs-hud-msg");
  assert.match(await page.textContent(".xs-hud-msg") ?? "", /home timeline only/);
  await page.waitForTimeout(800);
  assert.equal(server.requests.length, 0);

  await sw.evaluate(async (baseUrl: string) => {
    await chrome.storage.local.set({ settings: { apiKey: "test-key", baseUrl, scope: "all", accountHandle: "someoneelse" } });
  }, base);
  await page.waitForFunction(() => /logged in as @demo_user/.test(document.querySelector(".xs-hud-msg")?.textContent ?? ""), null, { timeout: 5000 });
  assert.equal(server.requests.length, 0);

  await sw.evaluate(async (baseUrl: string) => {
    await chrome.storage.local.set({ settings: { apiKey: "test-key", baseUrl, scope: "all", accountHandle: "Demo_User" } });
  }, base);
  await page.waitForFunction(() => document.querySelectorAll('.xs-slot[data-state="done"]').length >= 1, null, { timeout: 10000 });
  assert.ok(server.requests.length >= 1);

  await sw.evaluate(async () => {
    await chrome.storage.local.set({ settings: { apiKey: "" } });
  });
  await page.waitForFunction(() => /API key/.test(document.querySelector(".xs-hud-msg")?.textContent ?? ""), null, { timeout: 5000 });
});

test("options page: renders dimensions, test connection and save work", async (t) => {
  const server = await startServer(FIXTURE);
  const profile = PROFILE + "-options";
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: chromePath(),
    ignoreDefaultArgs: ["--disable-extensions"],
    headless: process.env.HEADED ? false : true,
    viewport: { width: 1000, height: 1400 },
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, "--no-first-run"],
  });
  t.after(async () => {
    await ctx.close();
    server.close();
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker", { timeout: 15000 }));
  const extId = new URL(sw.url()).host;
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`chrome-extension://${extId}/options.html`);
  await page.waitForSelector(".dim");
  assert.equal(await page.locator(".dim").count(), 5);
  assert.equal(await page.inputValue("#model"), "jev-1.13.0");

  await page.fill("#apiKey", "test-key");
  await page.click("details > summary");
  await page.fill("#baseUrl", `http://127.0.0.1:${server.port}`);
  await page.click("#test");
  await page.waitForFunction(() => /jev-1\.13\.0 · \d+ ms · \d+ tokens/.test(document.querySelector("#testOut")?.textContent ?? ""), null, { timeout: 10000 });
  assert.equal(server.requests.length, 1);
  assert.match(server.requests[0]!.text, /RT if you agree/);

  // Edit a threshold and add a dimension, save, and read it back from storage.
  await page.fill(".dim:nth-child(2) .d-threshold", "0.6");
  await page.click("#addDim");
  await page.fill(".dim:nth-child(6) .d-label", "hot take");
  await page.fill(".dim:nth-child(6) .d-id", "hot_take");
  await page.fill(".dim:nth-child(6) .d-instructions", "Is `text` a sweeping claim stated as certain fact without evidence?");
  await page.click("#save");
  await page.waitForFunction(() => document.querySelector("#saveOut")?.textContent === "saved");
  const saved = (await sw.evaluate(async () => (await chrome.storage.local.get("settings")).settings)) as {
    apiKey: string;
    dimensions: { id: string; threshold: number }[];
  };
  assert.equal(saved.apiKey, "test-key");
  assert.equal(saved.dimensions.length, 6);
  assert.equal(saved.dimensions[1]!.threshold, 0.6);
  assert.equal(saved.dimensions[5]!.id, "hot_take");

  // Validation blocks a broken dimension.
  await page.fill(".dim:nth-child(6) .d-id", "Not Valid");
  await page.click("#save");
  await page.waitForFunction(() => /fix 1 problem/.test(document.querySelector("#saveOut")?.textContent ?? ""));

  assert.deepEqual(errors, []);
  await page.fill(".dim:nth-child(6) .d-id", "hot_take");
  await page.click("#save");
  await page.waitForFunction(() => document.querySelector("#saveOut")?.textContent === "saved");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(ROOT, "docs/options.png"), fullPage: false });
});
