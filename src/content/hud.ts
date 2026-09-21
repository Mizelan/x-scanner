import type { SessionSnapshot } from "./stats.ts";

const COLLAPSE_KEY = "xs-hud-collapsed";

/** The fixed panel in the corner. The only technical evidence on screen. */
export class Hud {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private msg: HTMLElement;
  private v: Record<string, HTMLElement> = {};

  constructor(onOpenSettings: () => void) {
    this.root = el("div", "xs-hud");
    const title = el("div", "xs-hud-title");
    title.innerHTML = `<span>x-scanner</span><span class="xs-hud-tog" aria-label="접기">–</span>`;
    title.addEventListener("click", () => this.toggle());
    this.root.appendChild(title);

    this.msg = el("div", "xs-hud-msg");
    this.msg.hidden = true;
    this.root.appendChild(this.msg);

    this.body = el("div", "xs-hud-body");
    for (const [key, label] of [
      ["analyzed", "분석"],
      ["cost", "비용"],
      ["latency", "최근 호출"],
      ["rate", "속도"],
    ] as const) {
      const row = el("div", "xs-hud-row");
      const k = el("span", "xs-hud-k");
      k.textContent = label;
      const v = el("span", "xs-hud-v");
      v.textContent = "–";
      row.append(k, v);
      this.body.appendChild(row);
      this.v[key] = v;
    }
    const foot = el("div", "xs-hud-foot");
    this.v.foot = foot;
    this.body.appendChild(foot);
    const gear = el("a", "xs-hud-gear");
    gear.textContent = "설정";
    gear.addEventListener("click", (e) => {
      e.preventDefault();
      onOpenSettings();
    });
    this.body.appendChild(gear);
    this.root.appendChild(this.body);

    let collapsed = false;
    try {
      collapsed = localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (collapsed) this.root.classList.add("xs-collapsed");
  }

  mount(): void {
    if (!this.root.isConnected) document.documentElement.appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
  }

  /** Replace the counters with a one line status, e.g. missing key or paused by scope. */
  message(html: string | null): void {
    if (html === null) {
      this.msg.hidden = true;
      this.body.hidden = false;
      return;
    }
    this.msg.innerHTML = html;
    this.msg.hidden = false;
    this.body.hidden = true;
  }

  update(s: SessionSnapshot): void {
    this.v.analyzed!.textContent = String(s.analyzed);
    this.v.cost!.textContent = `$${s.costUsd.toFixed(4)}`;
    this.v.latency!.textContent = s.lastLatencyMs === null ? "–" : `${s.lastLatencyMs} ms`;
    this.v.rate!.textContent = `${s.judgmentsPerSec.toFixed(1)} 판정/초`;
    const bits = [`대기 ${s.pending}`, `진행 ${s.inflight}`, `캐시 ${s.cacheHits}`];
    if (s.errors) bits.push(`오류 ${s.errors}`);
    this.v.foot!.textContent = bits.join(" · ");
    this.v.foot!.title = s.lastError ?? "";
  }

  private toggle(): void {
    const c = this.root.classList.toggle("xs-collapsed");
    try {
      localStorage.setItem(COLLAPSE_KEY, c ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
