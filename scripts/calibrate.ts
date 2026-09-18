// Runs the default questions against the fixture samples with the real Jev API and prints
// every value, so thresholds can be tuned on evidence. Needs TYPESAFE_API_KEY in the env.
// Cost: about 18 posts x ~800 tokens x $0.042/M, under a tenth of a cent per run.
import { readFile } from "node:fs/promises";
import { DEFAULT_DIMENSIONS, buildQuestions } from "../src/shared/questions.ts";
import { callJev, costUsd, DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_PRICE_PER_MTOK } from "../src/shared/jev.ts";
import { verdicts } from "../src/content/labels.ts";

const key = process.env.TYPESAFE_API_KEY;
if (!key) {
  console.error("set TYPESAFE_API_KEY");
  process.exit(1);
}
const samples = JSON.parse(await readFile(new URL("../test/fixture/samples.json", import.meta.url), "utf8")) as {
  key: string;
  text: string;
  quoted?: string;
  reply_to?: string;
  promoted?: boolean;
}[];
const questions = buildQuestions(DEFAULT_DIMENSIONS);
let tokens = 0;
let ms = 0;
let n = 0;
const rows: string[] = [];
for (const s of samples) {
  if (!s.text || s.promoted) continue;
  const state: Record<string, unknown> = { text: s.text, is_reply: Boolean(s.reply_to) };
  if (s.quoted) state.quoted_text = s.quoted;
  const { response, latencyMs } = await callJev({ model: DEFAULT_MODEL, state, questions }, { baseUrl: DEFAULT_BASE_URL, apiKey: key });
  tokens += response.usage.input_tokens;
  ms += latencyMs;
  n++;
  const vs = verdicts(DEFAULT_DIMENSIONS, response.answers);
  const cells = vs.map((v) => (v.type === "noul" ? v.value.toFixed(2) : v.value.toFixed(2)).padStart(5) + (v.show ? "*" : " "));
  rows.push(`${s.key.padEnd(18)} ${cells.join(" ")}  ${String(response.usage.input_tokens).padStart(4)}tok ${String(latencyMs).padStart(4)}ms`);
}
console.log(`${"sample".padEnd(18)} ${DEFAULT_DIMENSIONS.map((d) => d.id.slice(0, 5).padStart(6)).join(" ")}`);
console.log(rows.join("\n"));
console.log(`\n${n} posts · ${tokens} input tokens · avg ${Math.round(tokens / n)} tok/post · avg ${Math.round(ms / n)} ms · $${costUsd(tokens, DEFAULT_PRICE_PER_MTOK).toFixed(6)} total · * = pill shown at default thresholds`);
