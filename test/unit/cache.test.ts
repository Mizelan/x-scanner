import { test } from "node:test";
import assert from "node:assert/strict";
import { LruCache } from "../../src/content/cache.ts";

test("evicts the least recently used entry past max", () => {
  const c = new LruCache<number>(2);
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  assert.equal(c.has("a"), false);
  assert.equal(c.has("b"), true);
  assert.equal(c.size, 2);
});

test("get refreshes recency", () => {
  const c = new LruCache<number>(2);
  c.set("a", 1);
  c.set("b", 2);
  c.get("a");
  c.set("c", 3);
  assert.equal(c.has("b"), false);
  assert.equal(c.has("a"), true);
});

test("from() rebuilds in order and respects max", () => {
  const c = LruCache.from<number>(
    [
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ],
    2,
  );
  assert.deepEqual(
    c.entries().map(([k]) => k),
    ["b", "c"],
  );
});
