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
  assert.equal(s.version, 8);
  assert.equal(s.dimensions.length, 6);
});

test("keeps custom dimensions and normalizes their shape", () => {
  const s = normalizeSettings({
    version: 8,
    dimensions: [{ id: "x", label: "x", type: "noul", instructions: "?", threshold: "0.7" }],
  });
  assert.equal(s.dimensions.length, 1);
  assert.equal(s.dimensions[0]!.threshold, 0.7);
  assert.deepEqual(s.dimensions[0]!.criteria, { true: "", false: "" });
  assert.equal(s.dimensions[0]!.enabled, true);
});

test("localizes shipped default labels but leaves custom labels alone", () => {
  const s = normalizeSettings({
    dimensions: [
      { id: "info_density", label: "dense", type: "score", instructions: "?", levels: ["a", "b"], threshold: 1 },
      { id: "padding", label: "my own word", type: "score", instructions: "?", levels: ["a", "b"], threshold: 1 },
    ],
  });
  assert.equal(s.dimensions[0]!.label, "정보");
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

test("appends dimensions added after the stored version, but not ones the user removed since", () => {
  const five = { id: "x", label: "x", type: "noul", instructions: "?", threshold: 0.5 };
  const old = normalizeSettings({ dimensions: [five], version: 3 });
  assert.deepEqual(
    old.dimensions.map((d) => d.id),
    ["x", "shorts_tip"],
  );
  const fiveOnly = normalizeSettings({ dimensions: [five], version: 5 });
  assert.deepEqual(
    fiveOnly.dimensions.map((d) => d.id),
    ["x", "shorts_tip"],
  );
  const current = normalizeSettings({ dimensions: [five], version: 6 });
  assert.deepEqual(
    current.dimensions.map((d) => d.id),
    ["x"],
  );
});

test("drops the retired about_jev dimension from a pre-v8 install", () => {
  const s = normalizeSettings({
    version: 7,
    dimensions: [
      { id: "about_jev", label: "Jev언급", type: "noul", instructions: "?", threshold: 0.75 },
      { id: "x", label: "x", type: "noul", instructions: "?", threshold: 0.5 },
    ],
  });
  assert.deepEqual(
    s.dimensions.map((d) => d.id),
    ["x"],
  );
});

test("lowers promotion's default threshold for pre-v7 installs, keeps a deliberate one", () => {
  const base = { id: "promotion", label: "홍보", type: "noul", instructions: "?", direction: "above" as const };
  const old = normalizeSettings({ version: 6, dimensions: [{ ...base, threshold: 0.75 }] });
  assert.equal(old.dimensions[0]!.threshold, 0.6);
  const chosen = normalizeSettings({ version: 6, dimensions: [{ ...base, threshold: 0.9 }] });
  assert.equal(chosen.dimensions[0]!.threshold, 0.9);
});
