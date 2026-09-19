import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Branded Google Chrome dropped --load-extension in version 137, so prefer a Chrome for Testing or
 * Chromium build. Playwright's browser cache is the usual place to find one; CHROME_PATH overrides.
 */
export function chromePath(): string {
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
