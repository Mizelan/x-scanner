import { test } from "node:test";
import assert from "node:assert/strict";
import { formatValue, tooltip, verdicts } from "../../src/content/labels.ts";
import { DEFAULT_DIMENSIONS } from "../../src/shared/questions.ts";
import type { Answer } from "../../src/shared/types.ts";

const answers: Record<string, Answer> = {
  info_density: { type: "score", score: 2.97, confidence: 0.97, probabilities: {}, legend: {} },
  engagement_bait: { type: "noul", noul: 0.99 },
  promotion: { type: "noul", noul: 0.21 },
  secondhand: { type: "noul", noul: 0.06 },
  padding: { type: "score", score: 1.5, confidence: 0.25, probabilities: {}, legend: {} },
};

test("only dimensions at or past their threshold show", () => {
  const vs = verdicts(DEFAULT_DIMENSIONS, answers);
  const shown = vs.filter((v) => v.show).map((v) => v.id);
  assert.deepEqual(shown, ["info_density", "engagement_bait", "padding"]);
});

test("direction below flips the comparison", () => {
  const dims = DEFAULT_DIMENSIONS.map((d) => (d.id === "promotion" ? { ...d, direction: "below" as const, threshold: 0.3 } : d));
  const vs = verdicts(dims, answers);
  assert.equal(vs.find((v) => v.id === "promotion")!.show, true);
});

test("disabled dimensions and missing answers are skipped", () => {
  const dims = DEFAULT_DIMENSIONS.map((d) => (d.id === "padding" ? { ...d, enabled: false } : d));
  const { info_density: _drop, ...rest } = answers;
  const vs = verdicts(dims, rest);
  assert.deepEqual(
    vs.map((v) => v.id),
    ["engagement_bait", "promotion", "secondhand"],
  );
});

test("formatting and tooltip", () => {
  const vs = verdicts(DEFAULT_DIMENSIONS, answers);
  assert.equal(formatValue(vs[0]!), "3.0/3");
  assert.equal(formatValue(vs[1]!), "0.99");
  const tip = tooltip(vs, { inputTokens: 825, costUsd: 0.00003465, latencyMs: 113, model: "jev-1.13.0" });
  assert.match(tip, /dense 3\.0\/3 · engagement bait 0\.99 · .*825 tok · \$0\.000035 · 113 ms · jev-1\.13\.0$/);
});
