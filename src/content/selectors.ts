/**
 * Every X DOM selector lives here. If X changes its markup, this is the file to edit.
 * Written from x.com's markup as of 2025 (article[data-testid=tweet], tweetText, role=group action
 * bar, status permalink wrapping <time>) and exercised against the fixture in test/fixture/.
 */
export const SEL = {
  /** One timeline entry. */
  article: 'article[data-testid="tweet"]',
  /** The post body. A quoted post nested inside has its own. */
  tweetText: '[data-testid="tweetText"]',
  /** Wrapper of a quoted post inside an article. */
  quoteContainer: 'div[role="link"]',
  /** Permalink anchors; the one wrapping a <time> is the post's own. */
  statusLink: 'a[href*="/status/"]',
  /** Reply / repost / like bar. The label slot is inserted right above it. */
  actionBar: 'div[role="group"]',
  /** Old style promoted wrapper, still checked. */
  placementTracking: '[data-testid="placementTracking"]',
  /** Left nav profile link; its href is /<handle> of the logged in account. */
  profileLink: 'a[data-testid="AppTabBar_Profile_Link"]',
} as const;

/** Exact span text X uses to mark a promoted post, in the UI languages we know. */
export const PROMOTED_LABELS = new Set(["Ad", "Promoted", "廣告", "推廣", "广告", "プロモーション", "광고"]);

/** Prefix X puts above a reply's text. */
export const REPLYING_TO = ["Replying to", "回覆", "回复", "返信先", "답글"];
