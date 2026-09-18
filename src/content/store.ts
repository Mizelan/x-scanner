import type { AnalysisResult } from "../shared/types.ts";
import { LruCache } from "./cache.ts";

const CACHE_KEY = "cache";

interface Persisted {
  questionsHash: string;
  entries: [string, AnalysisResult][];
}

/**
 * Results keyed by tweet id, persisted to extension storage so scrolling back, reloading,
 * or reopening X never re-bills a post. Dropped wholesale when the questions change.
 */
export class ResultStore {
  private cache: LruCache<AnalysisResult>;
  private saveTimer: number | null = null;
  private questionsHash: string;

  constructor(questionsHash: string, max: number) {
    this.questionsHash = questionsHash;
    this.cache = new LruCache<AnalysisResult>(max);
  }

  get size(): number {
    return this.cache.size;
  }

  async load(): Promise<void> {
    try {
      const got = await chrome.storage.local.get(CACHE_KEY);
      const p = got[CACHE_KEY] as Persisted | undefined;
      if (p && p.questionsHash === this.questionsHash && Array.isArray(p.entries)) {
        this.cache = LruCache.from(p.entries, this.cache.max);
      }
    } catch {
      /* storage unavailable, run in memory */
    }
  }

  has(id: string): boolean {
    return this.cache.has(id);
  }

  get(id: string): AnalysisResult | undefined {
    return this.cache.get(id);
  }

  set(id: string, result: AnalysisResult): void {
    this.cache.set(id, result);
    this.scheduleSave();
  }

  clear(): void {
    this.cache.clear();
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      const payload: Persisted = { questionsHash: this.questionsHash, entries: this.cache.entries() };
      chrome.storage.local.set({ [CACHE_KEY]: payload }).catch(() => {});
    }, 1000);
  }
}
