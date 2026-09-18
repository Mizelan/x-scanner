import type { AnalysisResult, Answer, Dimension, Verdict } from "../shared/types.ts";
import { maxValue } from "../shared/questions.ts";

export function answerValue(a: Answer): number {
  if (a.type === "noul") return a.noul;
  if (a.type === "score") return a.score;
  return a.confidence;
}

/** Apply each dimension's threshold and direction. Pure display policy, no inference. */
export function verdicts(dimensions: Dimension[], answers: Record<string, Answer>): Verdict[] {
  const out: Verdict[] = [];
  for (const d of dimensions) {
    if (!d.enabled) continue;
    const a = answers[d.id];
    if (!a) continue;
    const value = answerValue(a);
    const show = d.direction === "above" ? value >= d.threshold : value <= d.threshold;
    out.push({ id: d.id, label: d.label, type: d.type, value, max: maxValue(d), threshold: d.threshold, direction: d.direction, show });
  }
  return out;
}

/** Noul as a percentage, Score as position over the top level. */
export function formatValue(v: Verdict): string {
  return v.type === "noul" ? `${Math.round(v.value * 100)}%` : `${v.value.toFixed(1)}/${v.max}`;
}

/** Hover text on the label slot: every raw value plus what the call cost. */
export function tooltip(vs: Verdict[], r: Pick<AnalysisResult, "inputTokens" | "costUsd" | "latencyMs" | "model">): string {
  const parts = vs.map((v) => `${v.label} ${formatValue(v)}`);
  parts.push(`${r.inputTokens} tok`, `$${r.costUsd.toFixed(6)}`, `${r.latencyMs} ms`, r.model);
  return parts.join(" · ");
}
