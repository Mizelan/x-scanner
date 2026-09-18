import { test } from "node:test";
import assert from "node:assert/strict";
import { Scheduler } from "../../src/content/queue.ts";

const tick = () => new Promise((r) => setTimeout(r, 0));
function gate() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const p = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { p, resolve, reject };
}

test("runs at most `concurrency` tasks at once and drains in FIFO order", async () => {
  const s = new Scheduler(2);
  const started: string[] = [];
  const gates = new Map<string, ReturnType<typeof gate>>();
  const task = (k: string) => {
    const g = gate();
    gates.set(k, g);
    return () => {
      started.push(k);
      return g.p;
    };
  };
  for (const k of ["a", "b", "c", "d"]) s.enqueue(k, task(k));
  assert.deepEqual(started, ["a", "b"]);
  assert.equal(s.inflight, 2);
  assert.equal(s.pending, 2);
  gates.get("a")!.resolve();
  await tick();
  assert.deepEqual(started, ["a", "b", "c"]);
  gates.get("b")!.resolve();
  gates.get("c")!.resolve();
  await tick();
  assert.deepEqual(started, ["a", "b", "c", "d"]);
  gates.get("d")!.resolve();
  await tick();
  assert.equal(s.inflight, 0);
  assert.equal(s.pending, 0);
});

test("cancel removes queued work but cannot touch in-flight work", async () => {
  const s = new Scheduler(1);
  const g = gate();
  s.enqueue("a", () => g.p);
  s.enqueue("b", async () => {});
  assert.equal(s.cancel("a"), false, "in flight");
  assert.equal(s.cancel("b"), true, "queued");
  assert.equal(s.pending, 0);
  g.resolve();
  await tick();
});

test("enqueue dedupes by key while queued or running", () => {
  const s = new Scheduler(1);
  const g = gate();
  assert.equal(s.enqueue("a", () => g.p), true);
  assert.equal(s.enqueue("a", () => g.p), false);
  assert.equal(s.enqueue("b", async () => {}), true);
  assert.equal(s.enqueue("b", async () => {}), false);
  g.resolve();
});

test("a failing task does not stall the pump", async () => {
  const s = new Scheduler(1);
  let ran = false;
  s.enqueue("boom", async () => {
    throw new Error("x");
  });
  s.enqueue("next", async () => {
    ran = true;
  });
  await tick();
  await tick();
  assert.equal(ran, true);
});

test("onChange fires on every transition and setConcurrency pumps", async () => {
  const s = new Scheduler(1);
  let changes = 0;
  s.onChange(() => changes++);
  const g1 = gate();
  const g2 = gate();
  s.enqueue("a", () => g1.p);
  s.enqueue("b", () => g2.p);
  assert.equal(s.inflight, 1);
  s.setConcurrency(2);
  assert.equal(s.inflight, 2);
  assert.ok(changes >= 3);
  g1.resolve();
  g2.resolve();
  await tick();
});
