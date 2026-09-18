import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/shared/settings.ts";

test("fills defaults for a missing or partial object", () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  const s = normalizeSettings({ apiKey: "  k  ", accountHandle: "@Someone", scope: "weird", concurrency: 99, dwellMs: -5 });
  assert.equal(s.apiKey, "k");
  assert.equal(s.accountHandle, "Someone");
  assert.equal(s.scope, "all");
  assert.equal(s.concurrency, 32);
  assert.equal(s.dwellMs, 0);
  assert.equal(s.lookaheadPx, 800);
  assert.equal(s.version, 3);
  assert.equal(s.dimensions.length, 5);
});

test("keeps custom dimensions and normalizes their shape", () => {
  const s = normalizeSettings({
    dimensions: [{ id: "x", label: "x", type: "noul", instructions: "?", threshold: "0.7" }],
  });
  assert.equal(s.dimensions.length, 1);
  assert.equal(s.dimensions[0]!.threshold, 0.7);
  assert.deepEqual(s.dimensions[0]!.criteria, { true: "", false: "" });
  assert.equal(s.dimensions[0]!.enabled, true);
});

test("migrates renamed default labels but leaves custom labels alone", () => {
  const s = normalizeSettings({
    dimensions: [
      { id: "info_density", label: "dense", type: "score", instructions: "?", levels: ["a", "b"], threshold: 1 },
      { id: "padding", label: "my own word", type: "score", instructions: "?", levels: ["a", "b"], threshold: 1 },
    ],
  });
  assert.equal(s.dimensions[0]!.label, "fact-dense");
  assert.equal(s.dimensions[1]!.label, "my own word");
});

test("moves a v1 install's saved 200 ms dwell to the new default, keeps a deliberate value", () => {
  assert.equal(normalizeSettings({ dwellMs: 200 }).dwellMs, 0);
  assert.equal(normalizeSettings({ dwellMs: 350 }).dwellMs, 350);
  assert.equal(normalizeSettings({ dwellMs: 200, version: 2 }).dwellMs, 200);
});

test("moves a pre-v3 install's saved home scope to all, keeps a deliberate v3 choice", () => {
  assert.equal(normalizeSettings({ scope: "home" }).scope, "all");
  assert.equal(normalizeSettings({ scope: "home", version: 2 }).scope, "all");
  assert.equal(normalizeSettings({ scope: "home", version: 3 }).scope, "home");
});
