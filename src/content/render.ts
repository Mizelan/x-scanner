import type { Verdict } from "../shared/types.ts";
import { SEL } from "./selectors.ts";

export const SLOT_CLASS = "xs-slot";
export type SlotState = "idle" | "queued" | "inflight" | "done" | "error" | "skipped";

/** Reserve the fixed height label area right above the action bar. Idempotent. */
export function ensureSlot(article: Element, tweetId: string | null): HTMLElement {
  let slot = article.querySelector<HTMLElement>(`:scope .${SLOT_CLASS}`);
  if (!slot) {
    slot = document.createElement("div");
    slot.className = SLOT_CLASS;
    slot.dataset.state = "idle";
    const bar = article.querySelector(SEL.actionBar);
    if (bar?.parentElement) bar.parentElement.insertBefore(slot, bar);
    else article.appendChild(slot);
  }
  if (tweetId) slot.dataset.tweetId = tweetId;
  return slot;
}

export function getSlot(article: Element): HTMLElement | null {
  return article.querySelector<HTMLElement>(`:scope .${SLOT_CLASS}`);
}

export function markSlot(slot: HTMLElement, state: SlotState, title?: string): void {
  slot.dataset.state = state;
  if (title !== undefined) slot.title = title;
  if (state === "error") slot.classList.add("xs-in");
}

/** Fill the slot with the pills that cleared their threshold, then fade in. */
export function fillSlot(slot: HTMLElement, vs: Verdict[], title: string): void {
  slot.textContent = "";
  slot.dataset.state = "done";
  slot.title = title;
  for (const v of vs) {
    if (!v.show) continue;
    const pill = document.createElement("span");
    pill.className = "xs-pill";
    pill.dataset.dim = v.id;
    pill.textContent = v.label;
    slot.appendChild(pill);
  }
  slot.classList.remove("xs-in");
  requestAnimationFrame(() => slot.classList.add("xs-in"));
}
