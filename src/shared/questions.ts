import type { Dimension, JevQuestion } from "./types.ts";
import { fnv1a } from "./hash.ts";

/**
 * The default dimensions. All of them judge the text's behavior, never the author.
 * Labels are Korean (UI); prompts are English on purpose: Jev's docs say English is its
 * primary language and CJK is handled but not equally well. The tweet itself goes in as written.
 */
export const DEFAULT_DIMENSIONS: Dimension[] = [
  {
    id: "info_density",
    label: "정보",
    type: "score",
    instructions: "How much specific, verifiable content does `text` contain?",
    levels: [
      "No specific claims; opinion, mood, or a generic statement with nothing that could be checked",
      "One concrete detail such as a number, name, date, or link; the rest is general",
      "Several specific, checkable details: numbers, named sources, dates, or steps",
      "Dense with specifics; most sentences carry a checkable fact or a concrete instruction",
    ],
    threshold: 2.5,
    direction: "above",
    enabled: true,
  },
  {
    id: "engagement_bait",
    label: "유도",
    type: "noul",
    instructions:
      "Does `text` end by asking or prompting readers to reply, repost, like, follow, bookmark, or otherwise interact?",
    criteria: {
      true: "The closing lines request or nudge interaction, e.g. 'RT if you agree', 'drop a comment', 'follow for more', 'bookmark this', or a question posed only to draw replies",
      false: "No request or nudge for interaction; the post simply ends",
    },
    threshold: 0.75,
    direction: "above",
    enabled: true,
  },
  {
    id: "promotion",
    label: "홍보",
    type: "noul",
    instructions: "Is `text` promoting a product, course, newsletter, community, service, or paid offer?",
    criteria: {
      true: "Names or links to something the reader is meant to buy, sign up for, join, or subscribe to, including the author's own product",
      false: "No product, course, service, or offer is being pushed",
    },
    threshold: 0.6,
    direction: "above",
    enabled: true,
  },
  {
    id: "secondhand",
    label: "재탕",
    type: "noul",
    instructions:
      "Does `text` only relay or summarize someone else's view, without adding the author's own argument, evidence, or new information?",
    criteria: {
      true: "The post restates what another person, article, or account said, and the author adds nothing of their own beyond agreement or a short reaction",
      false: "The author states their own position, adds their own reasoning or evidence, or the post is original content",
    },
    threshold: 0.75,
    direction: "above",
    enabled: true,
  },
  {
    id: "padding",
    label: "잡담",
    type: "score",
    instructions: "How much of `text` is filler relative to the information it carries?",
    levels: [
      "Tight; every sentence adds something",
      "Some repetition, throat-clearing, or filler, but the point still comes through",
      "Mostly filler; the actual content could be said in one sentence",
    ],
    threshold: 1.5,
    direction: "above",
    enabled: true,
  },
  {
    id: "shorts_tip",
    label: "쇼츠",
    type: "noul",
    instructions:
      "Does `text` present itself as a shorts-style short tip — a hook-first, compressed piece of advice or \"facts\" meant to be skimmed, where the value is the feeling of knowing something rather than a checkable claim or a specific, actionable step?",
    criteria: {
      true: "The whole post is a punchy tip, maxim, or rapid-fire list of \"facts\" built for a short-form feed: \"most people don't know\", \"nobody talks about this\", \"save this before it's gone\", \"do this every morning\". It is short and confident yet carries no named source, no number with context, and no concrete, verifiable step",
      false: "The post delivers checkable substance (a named source, a number with context, a date, a link, or a specific how-to step), tells a personal story, argues a position, asks a real question, or is a reply — not a skimmable tip",
    },
    threshold: 0.75,
    direction: "above",
    enabled: true,
    color: "#7856ff",
  },
];

/** Dimensions added after the first release, appended to stored settings on upgrade. Keyed by the settings version that introduced them. */
export const ADDED_IN_VERSION: Record<number, string[]> = { 6: ["shorts_tip"] };

/** Turn enabled dimensions into the `questions` map Jev expects. */
export function buildQuestions(dimensions: Dimension[]): Record<string, JevQuestion> {
  const out: Record<string, JevQuestion> = {};
  for (const d of dimensions) {
    if (!d.enabled) continue;
    if (d.type === "score") {
      out[d.id] = { type: "score", instructions: d.instructions, criteria: d.levels ?? [] };
    } else {
      out[d.id] = { type: "noul", instructions: d.instructions, criteria: d.criteria };
    }
  }
  return out;
}

/**
 * Hash of everything that changes what Jev is asked. Thresholds, labels and direction are
 * display policy and deliberately excluded: changing them must not invalidate the cache.
 */
export function questionsHash(dimensions: Dimension[], model: string): string {
  const q = buildQuestions(dimensions);
  const keys = Object.keys(q).sort();
  return fnv1a(model + "|" + JSON.stringify(keys.map((k) => [k, q[k]])));
}

/** Highest value a dimension can take: 1 for noul, levels-1 for score. */
export function maxValue(d: Dimension): number {
  return d.type === "noul" ? 1 : Math.max(1, (d.levels?.length ?? 2) - 1);
}

/** Basic validation for the options page. Returns a list of problems, empty when fine. */
export function validateDimension(d: Dimension): string[] {
  const problems: string[] = [];
  if (!/^[a-z][a-z0-9_]*$/.test(d.id)) problems.push("id는 snake_case(a-z, 0-9, _)여야 합니다");
  if (!d.label.trim()) problems.push("칩 텍스트가 비어 있습니다");
  if (!d.instructions.trim()) problems.push("질문이 비어 있습니다");
  if (d.type === "score") {
    const n = d.levels?.filter((l) => l.trim()).length ?? 0;
    if (n < 2 || n > 10) problems.push("Score는 레벨이 2~10개 필요합니다");
    if (d.threshold < 0 || d.threshold > Math.max(0, n - 1)) problems.push(`임계치는 0~${n - 1}이어야 합니다`);
  } else {
    if (d.threshold < 0 || d.threshold > 1) problems.push("임계치는 0~1이어야 합니다");
  }
  return problems;
}
