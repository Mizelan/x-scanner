import type { Dimension, LifetimeStats, Settings } from "./types.ts";
import { DEFAULT_DIMENSIONS } from "./questions.ts";
import { DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_PRICE_PER_MTOK } from "./jev.ts";

export const SETTINGS_KEY = "settings";
export const STATS_KEY = "stats";

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  apiKey: "",
  model: DEFAULT_MODEL,
  baseUrl: DEFAULT_BASE_URL,
  pricePerMtok: DEFAULT_PRICE_PER_MTOK,
  scope: "home",
  accountHandle: "",
  dwellMs: 200,
  concurrency: 6,
  cacheMax: 5000,
  dimensions: DEFAULT_DIMENSIONS,
};

/** Fill in anything missing from an older or partial settings object. Never throws. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  const dims = Array.isArray(r.dimensions) && r.dimensions.length ? r.dimensions.map(normalizeDimension).map(migrateLabel) : DEFAULT_DIMENSIONS;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_SETTINGS.enabled,
    apiKey: typeof r.apiKey === "string" ? r.apiKey.trim() : "",
    model: typeof r.model === "string" && r.model.trim() ? r.model.trim() : DEFAULT_MODEL,
    baseUrl: typeof r.baseUrl === "string" && r.baseUrl.trim() ? r.baseUrl.trim() : DEFAULT_BASE_URL,
    pricePerMtok: finiteOr(r.pricePerMtok, DEFAULT_PRICE_PER_MTOK),
    scope: r.scope === "all" ? "all" : "home",
    accountHandle: typeof r.accountHandle === "string" ? r.accountHandle.replace(/^@/, "").trim() : "",
    dwellMs: clamp(Number(r.dwellMs), 0, 5000, DEFAULT_SETTINGS.dwellMs),
    concurrency: clamp(Number(r.concurrency), 1, 32, DEFAULT_SETTINGS.concurrency),
    cacheMax: clamp(Number(r.cacheMax), 100, 100000, DEFAULT_SETTINGS.cacheMax),
    dimensions: dims,
  };
}

/** Default labels that were renamed after release; stored settings still carrying the old one move along. */
const RENAMED_LABELS: Record<string, [string, string]> = {
  info_density: ["dense", "fact-dense"],
  padding: ["padded", "filler"],
};

function migrateLabel(d: Dimension): Dimension {
  const r = RENAMED_LABELS[d.id];
  return r && d.label === r[0] ? { ...d, label: r[1] } : d;
}

function normalizeDimension(d: Partial<Dimension>): Dimension {
  const type = d.type === "noul" ? "noul" : "score";
  return {
    id: String(d.id ?? "").trim(),
    label: String(d.label ?? "").trim(),
    type,
    instructions: String(d.instructions ?? ""),
    levels: type === "score" ? (Array.isArray(d.levels) ? d.levels.map(String) : []) : undefined,
    criteria: type === "noul" ? { true: String(d.criteria?.true ?? ""), false: String(d.criteria?.false ?? "") } : undefined,
    threshold: finiteOr(d.threshold, type === "noul" ? 0.75 : 1),
    direction: d.direction === "below" ? "below" : "above",
    enabled: d.enabled !== false,
  };
}

function finiteOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return v !== "" && v !== null && Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

export async function loadSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(got[SETTINGS_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: normalizeSettings(settings) });
}

export function onSettingsChange(cb: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "local" && changes[SETTINGS_KEY]) cb(normalizeSettings(changes[SETTINGS_KEY].newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export async function loadStats(): Promise<LifetimeStats> {
  const got = await chrome.storage.local.get(STATS_KEY);
  const s = (got[STATS_KEY] ?? {}) as Partial<LifetimeStats>;
  return { analyzed: s.analyzed ?? 0, inputTokens: s.inputTokens ?? 0, costUsd: s.costUsd ?? 0 };
}
