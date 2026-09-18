// Service worker. The only place that holds the API key and talks to Jev.
// The content script sends tweet state; this returns typed answers plus exact token usage.
import type { AnalyzeReply, LifetimeStats, Message, TweetState } from "./shared/types.ts";
import { loadSettings, onSettingsChange, STATS_KEY } from "./shared/settings.ts";
import { buildQuestions } from "./shared/questions.ts";
import { callJev, costUsd, JevError } from "./shared/jev.ts";

const SAMPLE: TweetState = {
  text: "Most people will never understand this about building a startup.\n\nIt is not about the idea. It is about the founder.\n\nRT if you agree and follow me for more founder lessons.",
  is_reply: false,
};

let settingsPromise = loadSettings();
onSettingsChange((s) => {
  settingsPromise = Promise.resolve(s);
});

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse: (r: unknown) => void) => {
  handle(msg).then(sendResponse, (e: unknown) => sendResponse({ ok: false, error: String((e as Error)?.message ?? e) }));
  return true;
});

async function handle(msg: Message): Promise<unknown> {
  switch (msg.type) {
    case "openOptions":
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    case "testConnection":
      return analyze(SAMPLE);
    case "analyze":
      return analyze(msg.state);
    default:
      return { ok: false, error: "unknown message" };
  }
}

async function analyze(state: TweetState): Promise<AnalyzeReply> {
  const s = await settingsPromise;
  if (!s.apiKey) return { ok: false, error: "no API key", status: 401 };
  const questions = buildQuestions(s.dimensions);
  if (Object.keys(questions).length === 0) return { ok: false, error: "no enabled dimensions" };
  try {
    const { response, latencyMs } = await callJev({ model: s.model, state, questions }, { baseUrl: s.baseUrl, apiKey: s.apiKey });
    const cost = costUsd(response.usage.input_tokens, s.pricePerMtok);
    bumpStats(response.usage.input_tokens, cost);
    return { ok: true, model: response.model, answers: response.answers, usage: response.usage, latencyMs, costUsd: cost };
  } catch (e) {
    const err = e as JevError;
    return { ok: false, error: err.message, status: err.status };
  }
}

// Lifetime totals live in storage, written by this single writer, serialized to avoid lost updates.
let statsChain: Promise<void> = Promise.resolve();
function bumpStats(inputTokens: number, cost: number): void {
  statsChain = statsChain
    .then(async () => {
      const got = await chrome.storage.local.get(STATS_KEY);
      const cur = (got[STATS_KEY] ?? { analyzed: 0, inputTokens: 0, costUsd: 0 }) as LifetimeStats;
      const next: LifetimeStats = {
        analyzed: cur.analyzed + 1,
        inputTokens: cur.inputTokens + inputTokens,
        costUsd: cur.costUsd + cost,
      };
      await chrome.storage.local.set({ [STATS_KEY]: next });
    })
    .catch(() => {});
}
