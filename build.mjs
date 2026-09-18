// Bundles the three entry points and copies static files into dist/ (or dist-e2e/ with --e2e,
// which also lets the content script run on http://127.0.0.1 so the fixture timeline can be tested).
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const watch = process.argv.includes("--watch");
const e2e = process.argv.includes("--e2e");
const outdir = e2e ? "dist-e2e" : "dist";

function copyStatic() {
  const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8"));
  if (e2e) {
    manifest.content_scripts[0].matches.push("http://127.0.0.1/*");
    manifest.host_permissions.push("http://127.0.0.1/*");
  }
  writeFileSync(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2));
  cpSync("src/options/options.html", `${outdir}/options.html`);
  cpSync("src/options/options.css", `${outdir}/options.css`);
  cpSync("src/content/content.css", `${outdir}/content.css`);
  cpSync("icons", `${outdir}/icons`, { recursive: true });
}

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const ctx = await esbuild.context({
  entryPoints: {
    content: "src/content/index.ts",
    background: "src/background.ts",
    options: "src/options/options.ts",
  },
  bundle: true,
  format: "iife",
  target: "chrome120",
  outdir,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
  plugins: [{ name: "static", setup: (b) => b.onEnd(copyStatic) }],
});

if (watch) {
  await ctx.watch();
  console.log(`watching, output in ${outdir}/`);
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
