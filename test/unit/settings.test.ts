import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/shared/settings.ts";

test("fills defaults for a missing or partial object", () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  const s = normalizeSettings({ apiKey: "  k  ", accountHandle: "@Someone", scope: "weird", concurrency: 99, dwellMs: -5 });
  assert.equal(s.apiKey, "k");
  assert.equal(s.accountHandle, "Someone");
  assert.equal(s.scope, "home");
  assert.equal(s.concurrency, 32);
  assert.equal(s.dwellMs, 0);
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
