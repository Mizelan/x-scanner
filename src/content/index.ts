// Content script entry. Wires the watcher, scheduler, cache, HUD and renderer together.
import type { AnalysisResult, AnalyzeReply, Settings, TweetState } from "../shared/types.ts";
import { loadSettings, onSettingsChange } from "../shared/settings.ts";
import { buildQuestions, questionsHash } from "../shared/questions.ts";
import { extractTweet, loggedInHandle, tweetId } from "./extract.ts";
import { TweetWatcher } from "./observe.ts";
import { Scheduler } from "./queue.ts";
import { ResultStore } from "./store.ts";
import { SessionStats } from "./stats.ts";
import { Hud } from "./hud.ts";
import { applyTheme, ensureSlot, fillSlot, getSlot, installDetailHandler, markSlot } from "./render.ts";
import { verdicts } from "./labels.ts";

const SETTINGS_LINK = `<a class="xs-link">settings</a>`;

class App {
  private hud: Hud;
  private watcher: TweetWatcher | null = null;
  private scheduler: Scheduler;
  private store: ResultStore;
  private stats = new SessionStats();
  private slots = new Map<string, HTMLElement>();
  private routeTimer: number | null = null;
  private tickTimer: number | null = null;
  private active = false;
  private stopped = false;
  private qhash: string;
  private settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
    this.qhash = questionsHash(settings.dimensions, settings.model);
    this.scheduler = new Scheduler(settings.concurrency);
    this.store = new ResultStore(this.qhash, settings.cacheMax);
    this.hud = new Hud(() => openOptions());
    this.hud.root.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).classList.contains("xs-link")) openOptions();
    });
  }

  async start(): Promise<void> {
    this.hud.mount();
    this.stats.subscribe((s) => this.hud.update(s));
    if (!this.settings.apiKey) {
      this.hud.message(`Add your TypeSafe API key in ${SETTINGS_LINK}`);
      return;
    }
    if (Object.keys(buildQuestions(this.settings.dimensions)).length === 0) {
      this.hud.message(`No dimensions enabled · ${SETTINGS_LINK}`);
      return;
    }
    await this.store.load();
    this.scheduler.onChange(() => this.stats.setQueue(this.scheduler.pending, this.scheduler.inflight));
    this.tickTimer = window.setInterval(() => this.stats.tick(), 500);
    this.routeTimer = window.setInterval(() => this.evaluateRoute(), 500);
    this.evaluateRoute();
  }

  destroy(): void {
    this.stopped = true;
    if (this.tickTimer !== null) clearInterval(this.tickTimer);
    if (this.routeTimer !== null) clearInterval(this.routeTimer);
    this.watcher?.stop();
    this.scheduler.clear();
    this.hud.destroy();
  }

  /** X is a single page app: the path and the account can change without a reload. */
  private evaluateRoute(): void {
    if (this.stopped) return;
    applyTheme();
    const reason = this.pausedReason();
    if (reason) {
      if (this.active) {
        this.watcher?.stop();
        this.scheduler.clear();
        this.active = false;
      }
      this.hud.message(reason);
      return;
    }
    if (!this.active) {
      this.hud.message(null);
      this.watcher = new TweetWatcher({
        dwellMs: this.settings.dwellMs,
        onMount: (a) => this.onMount(a),
        onDwell: (a) => this.onDwell(a),
        onLeave: (a) => this.onLeave(a),
      });
      this.watcher.start(document.body);
      this.active = true;
    }
  }

  private pausedReason(): string | null {
    const s = this.settings;
    if (s.scope === "home" && location.pathname !== "/home") return "paused · home timeline only";
    if (s.accountHandle) {
      const h = loggedInHandle();
      if (!h) return "paused · can't read the logged in account";
      if (h.toLowerCase() !== s.accountHandle.toLowerCase()) return `paused · logged in as @${h}`;
    }
    return null;
  }

  private onMount(article: HTMLElement): void {
    const id = tweetId(article);
    const slot = ensureSlot(article, id);
    if (!id) return;
    this.slots.set(id, slot);
    const cached = this.store.get(id);
    if (cached) {
      this.render(slot, cached);
      this.stats.recordCacheHit();
    }
  }

  private onDwell(article: HTMLElement): void {
    const t = extractTweet(article);
    if (!t) return;
    const slot = ensureSlot(article, t.id);
    this.slots.set(t.id, slot);
    if (t.promoted) {
      markSlot(slot, "skipped", "promoted, not analyzed");
      return;
    }
    if (!t.state.text) {
      markSlot(slot, "skipped", "no text to analyze");
      return;
    }
    const cached = this.store.get(t.id);
    if (cached) {
      if (slot.dataset.state !== "done") {
        this.render(slot, cached);
        this.stats.recordCacheHit();
      }
      return;
    }
    if (this.scheduler.has(t.id)) return;
    markSlot(slot, "queued");
    this.scheduler.enqueue(t.id, () => this.analyze(t.id, t.state));
  }

  private onLeave(article: HTMLElement): void {
    const slot = getSlot(article);
    const id = slot?.dataset.tweetId;
    if (slot && id && this.scheduler.cancel(id)) markSlot(slot, "idle");
  }

  private async analyze(id: string, state: TweetState): Promise<void> {
    const slot = this.slots.get(id);
    if (slot) markSlot(slot, "inflight");
    let reply: AnalyzeReply | undefined;
    try {
      reply = (await chrome.runtime.sendMessage({ type: "analyze", state })) as AnalyzeReply;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      reply = { ok: false, error: /context invalidated/i.test(msg) ? "extension reloaded, refresh the page" : msg };
    }
    if (!reply || !reply.ok) {
      const msg = reply?.error ?? "no reply from service worker";
      this.stats.recordError(msg);
      const s = this.slots.get(id);
      if (s) markSlot(s, "error", msg);
      if (reply?.status === 401) this.fatal(`Jev rejected the API key · ${SETTINGS_LINK}`);
      return;
    }
    const result: AnalysisResult = {
      tweetId: id,
      model: reply.model,
      answers: reply.answers,
      inputTokens: reply.usage.input_tokens,
      outputTokens: reply.usage.output_tokens,
      costUsd: reply.costUsd,
      latencyMs: reply.latencyMs,
      at: Date.now(),
      questionsHash: this.qhash,
    };
    this.store.set(id, result);
    this.stats.recordResult(result, Object.keys(reply.answers).length);
    const s = this.slots.get(id);
    if (s && s.isConnected && s.dataset.tweetId === id) this.render(s, result);
  }

  private render(slot: HTMLElement, r: AnalysisResult): void {
    fillSlot(slot, verdicts(this.settings.dimensions, r.answers), r);
  }

  private fatal(html: string): void {
    this.watcher?.stop();
    this.scheduler.clear();
    this.active = false;
    this.stopped = true;
    if (this.routeTimer !== null) clearInterval(this.routeTimer);
    this.hud.message(html);
  }
}

function openOptions(): void {
  chrome.runtime.sendMessage({ type: "openOptions" }).catch(() => {});
}

let app: App | null = null;

function apply(settings: Settings): void {
  app?.destroy();
  app = null;
  if (!settings.enabled) return;
  app = new App(settings);
  void app.start();
}

async function boot(): Promise<void> {
  const flag = "xScanner";
  if (document.documentElement.dataset[flag]) return;
  document.documentElement.dataset[flag] = "1";
  installDetailHandler();
  apply(await loadSettings());
  onSettingsChange(apply);
}

void boot();
