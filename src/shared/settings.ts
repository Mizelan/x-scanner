import type { Dimension, LifetimeStats, Settings } from "./types.ts";
import { ADDED_IN_VERSION, DEFAULT_DIMENSIONS } from "./questions.ts";
import { DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_PRICE_PER_MTOK } from "./jev.ts";

export const SETTINGS_KEY = "settings";
export const STATS_KEY = "stats";
/** v1: dwell 200 ms. v2: dwell 0, 800 px look-ahead. v3: scope all of X. v4: about_jev. v5: jevpilled, flag colors. v6: shorts_tip. v7: Korean labels, promotion 0.6. v8: about_jev removed. v9: shorts_tip weighs video length. */
export const SETTINGS_VERSION = 9;

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  apiKey: "",
  model: DEFAULT_MODEL,
  baseUrl: DEFAULT_BASE_URL,
  pricePerMtok: DEFAULT_PRICE_PER_MTOK,
  scope: "all",
  accountHandle: "",
  dwellMs: 0,
  lookaheadPx: 800,
  concurrency: 6,
  cacheMax: 5000,
  dimensions: DEFAULT_DIMENSIONS,
  version: SETTINGS_VERSION,
};

/** Fill in anything missing from an older or partial settings object. Never throws. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  const version = Number.isFinite(r.version) ? Number(r.version) : 1;
  // v1 installs saved the old 200 ms default into storage; carry them to the new default.
  const dwellRaw = version < 2 && Number(r.dwellMs) === 200 ? 0 : r.dwellMs;
  // v1 and v2 saved the old "home" default; follow the new default.
  const scopeRaw = version < 3 && r.scope === "home" ? "all" : r.scope;
  let dims = Array.isArray(r.dimensions) && r.dimensions.length ? r.dimensions.map(normalizeDimension).map(migrateLabel) : [...DEFAULT_DIMENSIONS];
  // about_jev was retired in v8; drop it from stored settings.
  if (version < 8) dims = dims.filter((d) => d.id !== "about_jev");
  // v9 sharpened the shorts_tip question to weigh video length; refresh an untouched stored copy.
  if (version < 9) dims = dims.map(refreshShortsTip);
  // v7 lowered promotion's default threshold; follow it unless the user set their own.
  if (version < 7) dims = dims.map((d) => (d.id === "promotion" && d.threshold === 0.75 ? { ...d, threshold: 0.6 } : d));
  // Defaults added after this install's version are appended; ones the user deleted later stay deleted.
  for (const [v, ids] of Object.entries(ADDED_IN_VERSION)) {
    if (version >= Number(v)) continue;
    for (const id of ids) {
      const def = DEFAULT_DIMENSIONS.find((d) => d.id === id);
      if (def && !dims.some((d) => d.id === id)) dims.push(def);
    }
  }
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_SETTINGS.enabled,
    apiKey: typeof r.apiKey === "string" ? r.apiKey.trim() : "",
    model: typeof r.model === "string" && r.model.trim() ? r.model.trim() : DEFAULT_MODEL,
    baseUrl: typeof r.baseUrl === "string" && r.baseUrl.trim() ? r.baseUrl.trim() : DEFAULT_BASE_URL,
    pricePerMtok: finiteOr(r.pricePerMtok, DEFAULT_PRICE_PER_MTOK),
    scope: scopeRaw === "home" ? "home" : "all",
    accountHandle: typeof r.accountHandle === "string" ? r.accountHandle.replace(/^@/, "").trim() : "",
    dwellMs: clamp(Number(dwellRaw), 0, 5000, DEFAULT_SETTINGS.dwellMs),
    lookaheadPx: clamp(Number(r.lookaheadPx), 0, 5000, DEFAULT_SETTINGS.lookaheadPx),
    concurrency: clamp(Number(r.concurrency), 1, 32, DEFAULT_SETTINGS.concurrency),
    cacheMax: clamp(Number(r.cacheMax), 100, 100000, DEFAULT_SETTINGS.cacheMax),
    dimensions: dims,
    version: SETTINGS_VERSION,
  };
}

/** Legacy label renames, applied before localization. */
const LEGACY_LABELS: Record<string, [string, string]> = {
  info_density: ["dense", "fact-dense"],
  padding: ["padded", "filler"],
};

/** English default label -> shipped Korean default. Only the shipped default moves; a user's own label is kept. */
const ENGLISH_DEFAULT_LABELS: Record<string, string> = {
  info_density: "fact-dense",
  engagement_bait: "engagement bait",
  promotion: "promo",
  secondhand: "secondhand",
  padding: "filler",
  shorts_tip: "shorts-tip",
};
const KOREAN_DEFAULT_LABELS: Record<string, string> = {
  info_density: "정보",
  engagement_bait: "유도",
  promotion: "홍보",
  secondhand: "재탕",
  padding: "잡담",
  shorts_tip: "쇼츠",
};

function migrateLabel(d: Dimension): Dimension {
  const r = LEGACY_LABELS[d.id];
  const renamed = r && d.label === r[0] ? { ...d, label: r[1] } : d;
  const en = ENGLISH_DEFAULT_LABELS[renamed.id];
  const ko = KOREAN_DEFAULT_LABELS[renamed.id];
  return en && ko && renamed.label === en ? { ...renamed, label: ko } : renamed;
}

/** The v6-v8 shorts_tip prompt; a stored copy still carrying it moves to the current wording at v9. */
const SHORTS_TIP_V8_INSTRUCTIONS =
  "Does `text` present itself as a shorts-style short tip — a hook-first, compressed piece of advice or \"facts\" meant to be skimmed, where the value is the feeling of knowing something rather than a checkable claim or a specific, actionable step?";

function refreshShortsTip(d: Dimension): Dimension {
  if (d.id !== "shorts_tip" || d.instructions !== SHORTS_TIP_V8_INSTRUCTIONS) return d;
  const def = DEFAULT_DIMENSIONS.find((x) => x.id === "shorts_tip");
  return def ? { ...d, instructions: def.instructions, criteria: def.criteria } : d;
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
    color: typeof d.color === "string" && /^#[0-9a-f]{6}$/i.test(d.color) ? d.color.toLowerCase() : undefined,
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
