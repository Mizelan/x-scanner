import { test } from "node:test";
import assert from "node:assert/strict";
import { callJev, costUsd, JevError } from "../../src/shared/jev.ts";
import type { JevRequest } from "../../src/shared/types.ts";

const body: JevRequest = { model: "jev-1.13.0", state: { text: "hi", is_reply: false }, questions: { q: { type: "noul", instructions: "?" } } };
const okJson = { model: "jev-1.13.0", answers: { q: { type: "noul", noul: 0.5 } }, usage: { input_tokens: 100, output_tokens: 10 } };

function fakeFetch(responses: Array<{ status: number; json?: unknown; headers?: Record<string, string> }>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses.shift();
    if (!r) throw new Error("no more responses");
    return new Response(JSON.stringify(r.json ?? { error: "x" }), { status: r.status, headers: r.headers });
  }) as typeof fetch;
  return { impl, calls };
}

test("posts to /v1/systemone with bearer auth and returns usage", async () => {
  const f = fakeFetch([{ status: 200, json: okJson }]);
  const { response, latencyMs } = await callJev(body, { baseUrl: "https://api.example/", apiKey: "k", fetchImpl: f.impl });
  assert.equal(f.calls[0]!.url, "https://api.example/v1/systemone");
  const h = f.calls[0]!.init.headers as Record<string, string>;
  assert.equal(h.Authorization, "Bearer k");
  assert.equal(JSON.parse(f.calls[0]!.init.body as string).model, "jev-1.13.0");
  assert.equal(response.usage.input_tokens, 100);
  assert.ok(latencyMs >= 0);
});

test("retries 429 and 529 with backoff, honoring retry-after", async () => {
  const f = fakeFetch([{ status: 429, headers: { "retry-after": "2" } }, { status: 529 }, { status: 200, json: okJson }]);
  const sleeps: number[] = [];
  const { response } = await callJev(body, {
    baseUrl: "https://api.example",
    apiKey: "k",
    fetchImpl: f.impl,
    backoffMs: 100,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  assert.equal(f.calls.length, 3);
  assert.deepEqual(sleeps, [2000, 200]);
  assert.equal(response.model, "jev-1.13.0");
});

test("does not retry 401 or 422", async () => {
  for (const status of [401, 422]) {
    const f = fakeFetch([{ status, json: { detail: "bad" } }, { status: 200, json: okJson }]);
    await assert.rejects(
      callJev(body, { baseUrl: "https://api.example", apiKey: "k", fetchImpl: f.impl, sleep: async () => {} }),
      (e: unknown) => e instanceof JevError && e.status === status,
    );
    assert.equal(f.calls.length, 1);
  }
});

test("gives up after the configured attempts", async () => {
  const f = fakeFetch([{ status: 529 }, { status: 529 }]);
  await assert.rejects(callJev(body, { baseUrl: "https://api.example", apiKey: "k", fetchImpl: f.impl, attempts: 2, sleep: async () => {} }), /HTTP 529/);
  assert.equal(f.calls.length, 2);
});

test("rejects a malformed 200", async () => {
  const f = fakeFetch([{ status: 200, json: { nope: true } }]);
  await assert.rejects(callJev(body, { baseUrl: "https://api.example", apiKey: "k", fetchImpl: f.impl }), /malformed/);
});

test("cost is input tokens times list price", () => {
  assert.ok(Math.abs(costUsd(825, 0.042) - 0.00003465) < 1e-12);
  assert.equal(costUsd(0, 0.042), 0);
});
