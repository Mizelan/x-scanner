/** Events in a sliding window, for the judgments per second readout. */
export class RateWindow {
  private events: { at: number; n: number }[] = [];
  private windowMs: number;

  constructor(windowMs = 5000) {
    this.windowMs = windowMs;
  }

  add(n: number, at: number): void {
    this.events.push({ at, n });
    this.prune(at);
  }

  perSecond(now: number): number {
    this.prune(now);
    let sum = 0;
    for (const e of this.events) sum += e.n;
    return sum / (this.windowMs / 1000);
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.events.length && this.events[0]!.at < cutoff) this.events.shift();
  }
}

export interface SessionSnapshot {
  analyzed: number;
  costUsd: number;
  inputTokens: number;
  lastLatencyMs: number | null;
  judgmentsPerSec: number;
  pending: number;
  inflight: number;
  cacheHits: number;
  errors: number;
  lastError: string | null;
}

/** Counters for this page load. Lifetime totals live in the service worker. */
export class SessionStats {
  private analyzed = 0;
  private costUsd = 0;
  private inputTokens = 0;
  private lastLatencyMs: number | null = null;
  private pending = 0;
  private inflight = 0;
  private cacheHits = 0;
  private errors = 0;
  private lastError: string | null = null;
  private rate = new RateWindow(5000);
  private listeners = new Set<(s: SessionSnapshot) => void>();
  private now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
  }

  recordResult(r: { costUsd: number; inputTokens: number; latencyMs: number }, judgments: number): void {
    this.analyzed += 1;
    this.costUsd += r.costUsd;
    this.inputTokens += r.inputTokens;
    this.lastLatencyMs = r.latencyMs;
    this.rate.add(judgments, this.now());
    this.emit();
  }

  recordCacheHit(): void {
    this.cacheHits += 1;
    this.emit();
  }

  recordError(message: string): void {
    this.errors += 1;
    this.lastError = message;
    this.emit();
  }

  setQueue(pending: number, inflight: number): void {
    this.pending = pending;
    this.inflight = inflight;
    this.emit();
  }

  snapshot(): SessionSnapshot {
    return {
      analyzed: this.analyzed,
      costUsd: this.costUsd,
      inputTokens: this.inputTokens,
      lastLatencyMs: this.lastLatencyMs,
      judgmentsPerSec: this.rate.perSecond(this.now()),
      pending: this.pending,
      inflight: this.inflight,
      cacheHits: this.cacheHits,
      errors: this.errors,
      lastError: this.lastError,
    };
  }

  subscribe(cb: (s: SessionSnapshot) => void): () => void {
    this.listeners.add(cb);
    cb(this.snapshot());
    return () => this.listeners.delete(cb);
  }

  /** Re-emit so time based fields (rate) decay while nothing else happens. */
  tick(): void {
    this.emit();
  }

  private emit(): void {
    const s = this.snapshot();
    for (const l of this.listeners) l(s);
  }
}
