# x-scanner

A Chrome extension that runs a behavioral read on every post you scroll past on X, using
[TypeSafe's Jev](https://docs.typesafe.ai), and shows you exactly what it cost.

Five typed questions ride in one request per post. A small pill appears under a post only when an
answer crosses its threshold, so most of the timeline stays clean. A panel in the corner counts
posts, dollars to four decimals, last-call latency and judgments per second while you scroll.

![x-scanner on the fixture timeline](docs/screenshot.png)

*The screenshot is the test fixture in `test/fixture/`, which mimics X's markup, driven by the fake
Jev server in `test/e2e/`. Real X looks the same; the pills and panel are the extension's.*

## What it does

- A post that stays in the viewport for 200 ms is sent to Jev. No clicks, no hover.
- Five dimensions, all about the text's behavior and none about the author:

  | pill | type | question, in short | default threshold |
  | --- | --- | --- | --- |
  | `dense` | Score, 4 levels | how much specific, verifiable content the text has | ≥ 2.5 |
  | `engagement bait` | Noul | does it end by asking for replies, reposts, likes, follows, bookmarks | ≥ 0.85 |
  | `promo` | Noul | is it pushing a product, course, newsletter, community, or paid offer | ≥ 0.85 |
  | `secondhand` | Noul | does it only relay someone else's view without adding its own argument | ≥ 0.85 |
  | `padded` | Score, 3 levels | how much of it is filler relative to the information it carries | ≥ 1.5 |

- A fixed height slot is reserved under each post at mount time, so results never shift the layout.
- At most 6 requests in flight; the rest queue. A queued post that scrolls away before its turn is
  dropped from the queue, so you only pay for what you actually looked at.
- Results are cached by post id in extension storage. Scrolling back, reloading, or coming back
  tomorrow re-bills nothing. Editing a question or the model invalidates the cache; editing a
  threshold, label or direction does not.
- Promoted posts and posts without text are skipped and never sent.
- Hover a slot to see every raw value, the token count, the cost and latency of that call.

## Numbers

Measured on 2026-09-18 with `jev-1.13.0` over the 16 sample posts in `test/fixture/samples.json`
(`npm run calibrate` reproduces it, under a tenth of a cent per run):

| | |
| --- | --- |
| input tokens per post | 787 average (about 600 of them are the five questions, resent each call) |
| cost per post | $0.000033 |
| 1,000 posts | $0.033 |
| latency per call | 179 ms average, 115 to 350 ms range, first call of a session is the slow one |
| price basis | $0.042 per million input tokens, output free, from [docs.typesafe.ai/models](https://docs.typesafe.ai/models) |

The cost counter is exact, not estimated: Jev returns `usage.input_tokens` on every response and the
HUD multiplies by the list price you can edit in settings.

## Install

Chrome 120 or newer.

```sh
git clone <this repository>
cd x-scanner
npm install
npm run build
```

1. Open `chrome://extensions`, turn on Developer mode, click Load unpacked, pick the `dist/` folder.
2. Click the extension icon. Paste your TypeSafe API key, click Test connection, then Save.
3. Open [x.com/home](https://x.com/home) and scroll.

The key is stored in `chrome.storage.local` on this machine only. Nothing is sent anywhere except the
post text to `api.typesafe.ai`. There is no server and no analytics.

## Settings

- **Enabled**: master switch.
- **Scope**: Home timeline only (default) or everywhere on X (profiles, search, threads, lists).
- **Only when logged in as**: a handle. Useful if you switch between accounts and want it on one.
- **Dimensions**: every question is editable. Add, remove, disable, change type between Noul and
  Score, edit levels and criteria, set the threshold and whether the pill shows above or below it.
- **Advanced**: model (pinned to `jev-1.13.0` so thresholds stay meaningful), price, base URL,
  concurrency, dwell time, cache size.
- **Lifetime**: totals across sessions, a reset, and a cache clear.

Prompts default to English on purpose. Jev's docs say English is where its accuracy is best and CJK is
handled but not equally well. The post text itself goes in as written, in whatever language.

## How it works

```
content script                        service worker                 TypeSafe
──────────────                        ──────────────                 ────────
MutationObserver finds <article>  ─┐
IntersectionObserver, 200 ms dwell ─┤
extract id, text, quote, is_reply  ─┤
cache hit? render, done            ─┤
Scheduler (6 in flight, FIFO)      ─┼─ sendMessage({state}) ──────▶ POST /v1/systemone
render pills, update HUD          ◀┴─ {answers, usage, latency} ◀── {answers, usage}
```

- `src/content/selectors.ts` is the only file that knows X's DOM. If X changes its markup, fix it there.
- `src/content/observe.ts` handles the virtualized list: X mounts and unmounts article nodes as you
  scroll, so new nodes are picked up by a MutationObserver and removed nodes cancel their queued work.
- `src/content/queue.ts`, `cache.ts`, `labels.ts` and `stats.ts` are pure and unit tested.
- `src/background.ts` is the only code that sees the API key. It calls Jev with plain `fetch`, retries
  429 and 529 with backoff the way the official SDKs do, and keeps lifetime totals.
- `src/shared/questions.ts` holds the default dimensions and builds the request. The request for one post
  looks like this:

```json
{
  "model": "jev-1.13.0",
  "state": { "text": "…", "quoted_text": "…", "is_reply": false },
  "questions": {
    "info_density":    { "type": "score", "instructions": "…", "criteria": ["…", "…", "…", "…"] },
    "engagement_bait": { "type": "noul",  "instructions": "…", "criteria": { "true": "…", "false": "…" } },
    "promotion":       { "type": "noul",  "instructions": "…", "criteria": { "true": "…", "false": "…" } },
    "secondhand":      { "type": "noul",  "instructions": "…", "criteria": { "true": "…", "false": "…" } },
    "padding":         { "type": "score", "instructions": "…", "criteria": ["…", "…", "…"] }
  }
}
```

## Development

```sh
npm run watch        # rebuild dist/ on change
npm test             # unit tests: scheduler, cache, thresholds, stats, Jev client, settings, DOM extraction
npm run test:e2e     # loads the built extension into Chrome for Testing and scrolls the fixture timeline
npm run calibrate    # real Jev calls over the sample posts, prints every value (needs TYPESAFE_API_KEY)
npm run typecheck
```

The end-to-end test starts a fake Jev server, scrolls the fixture like a reader, and checks that pills
appear on the right posts, that promoted and empty posts are never sent, that the HUD's cost equals
token usage times price, that node recycling does not double-bill, that scrolling back and reloading
send nothing new, and that scope and account filters pause the extension. It needs a Chromium or Chrome
for Testing binary (`npx playwright-core install chromium`, or set `CHROME_PATH`); branded Google Chrome
no longer accepts `--load-extension`.

## Known limits

- Jev reads literally. A post that argues for its own classification can move an answer. Thresholds
  default high for that reason.
- The DOM selectors were written from x.com's markup as of 2025 and are exercised against the fixture,
  not against a live logged-in timeline in this repo's tests. If X has moved things, `selectors.ts` is
  the one file to fix.
- Promoted posts are detected by the "Ad" label text in a few UI languages plus the older
  `placementTracking` wrapper. Add your language's label in `selectors.ts` if X shows something else.
- The five prompts are tuned on English. Run `npm run calibrate` on your own samples before trusting the
  defaults on another language.
- Score values are used only as thresholds, never interpolated, per the Jev docs.

## 中文說明

一個 Chrome 外掛：你在 X 上滑到的每則推文，只要在畫面停留超過 200 毫秒，就會被送去 Jev 做五個固定維度
的文本行為判斷（資訊密度、Engagement bait、推銷、轉述、灌水）。五題併在同一個 request；只有超過門檻的
維度才會在推文下方亮出一顆單色 pill，大多數推文分析完仍是空白。右下角面板即時顯示本次分析則數、累計花費
（小數點後四位，用 Jev 回傳的 token 數精確計算）、上一次呼叫延遲、每秒判斷數。

同時進行的請求上限 6，超過排隊；滑走的推文自動離隊不計費。結果以推文 ID 快取在 extension storage，回捲、
重新整理都不重新計費。廣告與純圖片推文不送出。無後端、無資料蒐集，API key 只存在本機。

設定頁可編輯、增刪五個問題與門檻，可設定只在首頁時間軸或指定帳號登入時啟用。提示詞預設英文，因為 Jev 文件
說明英文準確度最佳、中日韓文可用但較弱；推文本身以原文送出。

## License

MIT
