import type { AnalysisResult, Verdict } from "../shared/types.ts";
import { SEL } from "./selectors.ts";
import { formatValue } from "./labels.ts";

export const SLOT_CLASS = "xs-slot";
export type SlotState = "idle" | "queued" | "inflight" | "done" | "error" | "skipped";

const data = new WeakMap<HTMLElement, { vs: Verdict[]; r: AnalysisResult }>();
let openDetail: HTMLElement | null = null;

/**
 * Put the verdict slot in the post's header row, right aligned before the menu button, where X
 * shows its own "Ad" label. Falls back to a floating position at the article's top right.
 * Idempotent, and inline in the row so it never shifts the layout.
 */
export function ensureSlot(article: Element, tweetId: string | null): HTMLElement {
  let slot = article.querySelector<HTMLElement>(`:scope .${SLOT_CLASS}`);
  if (!slot) {
    slot = document.createElement("div");
    slot.className = SLOT_CLASS;
    slot.dataset.state = "idle";
    const row = headerRow(article);
    if (row) {
      const name = row.querySelector(SEL.userName)!;
      row.insertBefore(slot, name.nextSibling);
    } else {
      slot.classList.add("xs-slot-float");
      (article as HTMLElement).classList.add("xs-rel");
      article.appendChild(slot);
    }
  }
  if (tweetId) slot.dataset.tweetId = tweetId;
  return slot;
}

/** The flex row holding the outer post's User-Name block, or null when the markup differs. */
function headerRow(article: Element): HTMLElement | null {
  for (const name of Array.from(article.querySelectorAll<HTMLElement>(SEL.userName))) {
    if (name.closest(SEL.quoteContainer) && article.contains(name.closest(SEL.quoteContainer)!)) continue;
    const row = name.parentElement;
    if (!row) return null;
    return getComputedStyle(row).display.includes("flex") ? row : null;
  }
  return null;
}

export function getSlot(article: Element): HTMLElement | null {
  return article.querySelector<HTMLElement>(`:scope .${SLOT_CLASS}`);
}

export function markSlot(slot: HTMLElement, state: SlotState, title?: string): void {
  slot.dataset.state = state;
  if (title !== undefined) slot.title = title;
  if (state === "error") {
    slot.textContent = "";
    const pill = document.createElement("span");
    pill.className = "xs-pill xs-pill-err";
    pill.textContent = "error";
    slot.appendChild(pill);
    slot.classList.add("xs-in");
  }
}

/** Fill the slot: one solid pill per flagged dimension, or a quiet "clean" pill. Then fade in. */
export function fillSlot(slot: HTMLElement, vs: Verdict[], r: AnalysisResult): void {
  slot.textContent = "";
  slot.dataset.state = "done";
  slot.title = "";
  data.set(slot, { vs, r });
  const hits = vs.filter((v) => v.show);
  if (hits.length === 0) {
    const pill = document.createElement("span");
    pill.className = "xs-pill xs-pill-clean";
    pill.textContent = "clean";
    slot.appendChild(pill);
  }
  for (const v of hits) {
    const pill = document.createElement("span");
    pill.className = "xs-pill xs-pill-hit";
    pill.dataset.dim = v.id;
    pill.textContent = v.label;
    slot.appendChild(pill);
  }
  slot.classList.remove("xs-in");
  requestAnimationFrame(() => slot.classList.add("xs-in"));
}

/** One document level listener: click a slot to toggle its detail card, click anywhere else to close. */
export function installDetailHandler(): void {
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".xs-detail")) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      const slot = target.closest<HTMLElement>(`.${SLOT_CLASS}`);
      if (!slot) {
        closeDetail();
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      const d = data.get(slot);
      if (!d) return;
      const already = slot.querySelector(".xs-detail");
      closeDetail();
      if (!already) openDetailFor(slot, d.vs, d.r);
    },
    true,
  );
}

function closeDetail(): void {
  openDetail?.remove();
  openDetail = null;
}

function openDetailFor(slot: HTMLElement, vs: Verdict[], r: AnalysisResult): void {
  const card = document.createElement("div");
  card.className = "xs-detail";
  for (const v of vs) {
    const row = document.createElement("div");
    row.className = "xs-detail-row" + (v.show ? " xs-hit" : "");
    const k = document.createElement("span");
    k.className = "xs-detail-k";
    k.textContent = v.label;
    const bar = document.createElement("span");
    bar.className = "xs-detail-bar";
    const fill = document.createElement("i");
    fill.style.width = `${Math.round((Math.max(0, Math.min(v.max, v.value)) / v.max) * 100)}%`;
    bar.appendChild(fill);
    const val = document.createElement("span");
    val.className = "xs-detail-v";
    val.textContent = formatValue(v);
    row.append(k, bar, val);
    card.appendChild(row);
  }
  const foot = document.createElement("div");
  foot.className = "xs-detail-foot";
  foot.textContent = `${r.inputTokens} tok · $${r.costUsd.toFixed(6)} · ${r.latencyMs} ms · ${r.model}`;
  card.appendChild(foot);
  slot.appendChild(card);
  openDetail = card;
}

/** Pick pill colors from X's actual theme (the user's choice, not the OS setting). */
export function applyTheme(): void {
  const bg = getComputedStyle(document.body).backgroundColor;
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
  const lum = m ? (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255 : 0;
  document.documentElement.classList.toggle("xs-dark", lum < 0.5);
}
