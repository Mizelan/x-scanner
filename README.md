# x-scanner

Behavioral labels on every post you scroll past on X, judged by [Jev](https://docs.typesafe.ai),
TypeSafe's System One model, with a counter in the corner showing exactly what it cost.

https://github.com/user-attachments/assets/bd9782e9-cd8d-426b-8585-e3473a007d11

Each post is sent to Jev with six typed questions in one request as soon as it comes within 800 px
of the viewport. The answer comes back in about 150 ms as numbers, not prose, and lands in a chip
under the post, usually before you have scrolled to it. Most posts come back clean and show nothing
at all; the ones that cross a threshold get a flag chip and their text is blurred until you hover
it. Scroll for a minute and the panel reads something like 80 posts, $0.0027.

## Install

Chrome 120 or newer. Until the Chrome Web Store listing is live, install from source; Node 22 or newer
is needed to build.

```sh
git clone https://github.com/oso95/x-scanner.git
cd x-scanner
npm install
npm run build
```

1. Open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, choose the `dist/` folder.
2. Click the x-scanner icon. Paste your TypeSafe API key, click **Test connection**, then **Save**.
3. Open [x.com](https://x.com) and scroll: home, profiles, search, threads, lists.

Your key lives in this browser's extension storage and nowhere else. The only network traffic is the
post text to `api.typesafe.ai`. No server, no analytics.

## What you see

**Under each post**, a chip styled like X's own metadata line, in Korean:

- Nothing at all when no threshold was crossed — a clean post stays invisible.
- `⚑ 유도 97%` in orange when one was, followed by every other value in gray. The flagged post's whole
  card is blurred until you hover it.
- `텍스트 없음` or `광고 · 분석 안 함` in dashed gray for posts that are skipped.
- Click the chip for a card with a bar per dimension, the token count, cost and latency of that call.

**Bottom right**, a small panel: posts analyzed this session, dollars spent to four decimals, the last
call's latency, and judgments per second. The dollar figure is exact, not estimated: Jev returns
`usage.input_tokens` with every answer.

## The six dimensions

All six judge the text's behavior, never the author. Every one is editable in settings.

| label | type | question, in short | flags when |
| --- | --- | --- | --- |
| `정보` | Score, 4 levels | how much specific, verifiable content the text has | ≥ 2.5 of 3 |
| `유도` | Noul | does it end by asking for replies, reposts, likes, follows, or bookmarks | ≥ 75% |
| `홍보` | Noul | is it pushing a product, course, newsletter, community, or paid offer | ≥ 60% |
| `재탕` | Noul | does it only relay someone else's view without adding its own argument | ≥ 75% |
| `잡담` | Score, 3 levels | how much of it is filler relative to the information it carries | ≥ 1.5 of 2 |
| `쇼츠` | Noul | does it read like a hook-first, low-substance short tip built for a short-form feed (a short video raises the odds) | ≥ 75% |

A Noul answer is Jev's probability that the answer is yes. A Score answer is a position on ordered
levels you describe. `정보`, the one positive label, uses these four:

0. No specific claims; opinion, mood, or a generic statement with nothing that could be checked
1. One concrete detail such as a number, name, date, or link; the rest is general
2. Several specific, checkable details: numbers, named sources, dates, or steps
3. Dense with specifics; most sentences carry a checkable fact or a concrete instruction

Thresholds, labels and direction are display policy. Change them and nothing is re-billed. Change a
question's wording, its levels, or the model, and the result cache is dropped.

## Cost and speed

Measured on 2026-09-18 with `jev-1.13.0` over the sample posts in `test/fixture/samples.json`.
`npm run calibrate` reproduces it for under a tenth of a cent.

| | |
| --- | --- |
| input tokens per post | 906 on average, about 720 of them the six questions themselves |
| cost per post | $0.000038 |
| cost per 1,000 posts | $0.038 |
| latency per call | 174 ms on average, first call of a session around 350 ms |
| price basis | $0.042 per million input tokens, output free ([docs.typesafe.ai/models](https://docs.typesafe.ai/models)) |

## Settings

- **Enabled**: master switch.
- **Scope**: everywhere on X (default), or the home timeline only.
- **Only when logged in as**: a handle, for people who switch accounts and want it on one.
- **Dimensions**: add, remove, disable, rename, switch between Noul and Score, edit the question, levels
  and criteria, set the threshold, whether the flag fires above or below it, and the flag color.
- **Advanced**: model (defaults to `jev-1.13.0` so thresholds keep their meaning), price, base URL,
  concurrency, look-ahead distance, wait before analyzing, cache size.
- **Lifetime**: totals across sessions, a reset, and a cache clear.

The chips, HUD and settings page are in Korean. The questions sent to Jev stay in English on purpose:
Jev's docs say English is where its accuracy is best and CJK is handled but not equally well. The post
text goes in as written, in whatever language. Renaming a label is display-only and re-bills nothing.

## How it works

- A MutationObserver picks up each `article` X mounts in its virtualized timeline; an
  IntersectionObserver with an 800 px bottom margin fires as soon as a post is near the viewport.
  A wait before sending is available in settings for people who would rather pay only for posts
  they actually stopped on.
- The content script extracts the post id, text, quoted text, reply flag and attached media (kind, and
  a video's length when the player has loaded it), and asks the service worker to analyze. Only the
  service worker holds the API key.
- One `POST /v1/systemone` per post carries all six questions. Retries follow the official SDKs:
  429 and 529 back off, everything else fails fast.
- At most 6 requests are in flight; the rest queue in order. A queued post that scrolls out of the
  zone before its turn is dropped, so a fast flick past fifty posts does not bill fifty calls. Set
  look-ahead to 0 and a wait of 200 ms to pay only for posts you actually stopped on.
- Results are cached by post id in extension storage. Scrolling back, reloading, or returning the next
  day re-bills nothing.
- Promoted posts and posts with no text are never sent.

```
src/
  background.ts         service worker: holds the key, calls Jev, keeps lifetime totals
  shared/
    questions.ts        the six default dimensions, request builder, cache hash
    jev.ts              HTTP client with backoff, cost math
    settings.ts         schema, defaults, normalization
  content/
    selectors.ts        every X DOM selector, in one place
    observe.ts          MutationObserver + IntersectionObserver, look-ahead and optional wait
    extract.ts          id, text, quote, reply, media and promoted detection
    queue.ts            concurrency-capped FIFO with cancel
    cache.ts, store.ts  LRU and its persistence
    labels.ts           threshold policy
    render.ts           the chip and the detail card
    hud.ts, stats.ts    the corner panel and its counters
  options/              settings page
test/
  unit/                 node:test over the pure modules and DOM extraction (jsdom)
  fixture/              a timeline that mimics X's markup and recycles nodes
  e2e/                  Playwright: real extension, fake Jev, scrolls the fixture
scripts/calibrate.ts    runs the defaults against the samples on the real API
```

## Development

```sh
npm run package      # build and zip dist/ for the Chrome Web Store
npm run watch        # rebuild dist/ on change
npm test             # unit tests
npm run test:e2e     # loads the built extension into Chrome for Testing (SCREENSHOT=1 also writes docs/screenshot.png)
npm run calibrate    # real Jev calls over the sample posts (needs TYPESAFE_API_KEY in the env)
npm run screenshots  # 1280x800 store screenshots from the fixture into store/
npm run typecheck
```

Store listing copy, permission justifications and the privacy policy are in `store/` and `PRIVACY.md`.

The end-to-end test starts a fake Jev server, scrolls the fixture like a reader, and checks that the
right flags appear, that promoted and empty posts are never sent, that the panel's cost equals token
usage times price, that node recycling does not double-bill, that scrolling back and reloading send
nothing new, that scope and account filters pause the extension, and that the settings page round
trips. It needs a Chromium or Chrome for Testing binary (`npx playwright-core install chromium`, or
set `CHROME_PATH`). Branded Google Chrome no longer accepts `--load-extension`.

## Limits

- Jev reads literally. A post written to argue for its own classification can move an answer, which is
  why thresholds default high.
- Works on x.com as of September 2026. The selectors live in `src/content/selectors.ts`; if X changes
  its markup, that is the file to fix. The automated tests run against the fixture, not live X.
- Promoted posts are recognized by the "Ad" label in a handful of UI languages. Add yours to
  `selectors.ts` if X shows something else.
- The prompts are tuned on English. Run `npm run calibrate` on your own samples before trusting the
  defaults in another language.

## 中文說明

一個 Chrome 外掛。你在 X 上滑到的每則推文，一接近畫面（預設提前 800 px）就送去 Jev 做六個維度的判斷：
資訊密度（정보）、互動誘導（유도）、推銷（홍보）、轉述（재탕）、灌水（잡담）、短影音式小撇步（쇼츠）。
六題併在同一個 request，約 150 毫秒回來。沒有超過門檻的推文完全不顯示；超過門檻的在推文下方標出，
且整張卡片會被模糊，滑鼠移入才清楚，後面接每個維度的數值；點一下看完整細節。右下角面板即時顯示本次分析
則數、累計花費（小數點後四位，用 Jev 回傳的 token 數精確計算）、上一次呼叫延遲、每秒判斷數。

同時進行的請求上限 6，超過排隊；滑走的推文自動離隊不計費。結果以推文 ID 快取，回捲、重新整理都不重新計費。
廣告與純圖片推文不送出。無後端、無資料蒐集，API key 只存在本機。介面（標籤、面板、設定頁）為韓文，
但送去 Jev 的問題維持英文。所有問題與門檻都可在設定頁編輯。

## License

MIT
