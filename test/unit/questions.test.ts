import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuestions, DEFAULT_DIMENSIONS, maxValue, questionsHash, validateDimension } from "../../src/shared/questions.ts";

test("builds one typed question per enabled dimension", () => {
  const q = buildQuestions(DEFAULT_DIMENSIONS);
  assert.deepEqual(Object.keys(q), ["info_density", "engagement_bait", "promotion", "secondhand", "padding", "about_jev"]);
  assert.equal(q.info_density!.type, "score");
  assert.equal((q.info_density!.criteria as string[]).length, 4);
  assert.equal(q.engagement_bait!.type, "noul");
  assert.ok((q.engagement_bait!.criteria as { true: string }).true.length > 10);
  const q2 = buildQuestions(DEFAULT_DIMENSIONS.map((d) => ({ ...d, enabled: d.id !== "padding" })));
  assert.equal("padding" in q2, false);
});

test("hash ignores display policy but tracks questions and model", () => {
  const base = questionsHash(DEFAULT_DIMENSIONS, "jev-1.13.0");
  const relabeled = DEFAULT_DIMENSIONS.map((d) => ({ ...d, label: d.label + "!", threshold: d.threshold / 2, direction: "below" as const }));
  assert.equal(questionsHash(relabeled, "jev-1.13.0"), base);
  const reworded = DEFAULT_DIMENSIONS.map((d) => (d.id === "padding" ? { ...d, instructions: d.instructions + " really" } : d));
  assert.notEqual(questionsHash(reworded, "jev-1.13.0"), base);
  assert.notEqual(questionsHash(DEFAULT_DIMENSIONS, "jev-latest"), base);
  const disabled = DEFAULT_DIMENSIONS.map((d) => (d.id === "padding" ? { ...d, enabled: false } : d));
  assert.notEqual(questionsHash(disabled, "jev-1.13.0"), base);
});

test("max value is 1 for noul and levels-1 for score", () => {
  assert.equal(maxValue(DEFAULT_DIMENSIONS[0]!), 3);
  assert.equal(maxValue(DEFAULT_DIMENSIONS[1]!), 1);
});

test("validation catches the usual mistakes", () => {
  for (const d of DEFAULT_DIMENSIONS) assert.deepEqual(validateDimension(d), []);
  const bad = { ...DEFAULT_DIMENSIONS[0]!, id: "Bad Id", label: " ", levels: ["only one"], threshold: 5 };
  const problems = validateDimension(bad);
  assert.equal(problems.length, 4, problems.join("; "));
  const badNoul = { ...DEFAULT_DIMENSIONS[1]!, threshold: 1.5 };
  assert.equal(validateDimension(badNoul).length, 1);
});
