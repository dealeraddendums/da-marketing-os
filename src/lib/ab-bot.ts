// Home B A/B test — bot classification, shared by middleware (serving: bots
// are pinned to A with no cookie) and /api/ab/seen (counting guard).
//
// Kept in its OWN module with zero imports: middleware runs on the edge
// runtime and must not pull the supabase client in via lib/ab-home.ts.
//
// The named "usual suspects" are all substring-matched already — GPTBot,
// ClaudeBot, PerplexityBot, Amazonbot, Slackbot, Bytespider (→ bot/spider),
// python-requests (→ python), Go-http-client (→ go-http), HeadlessChrome,
// curl, facebookexternalhit (literal) — listed explicitly anyway so a future
// reader greps straight to them and so a vendor rename can't silently
// un-match one.
// zgrab / censys / forestengine / google-lens / palo alto: caught red-handed
// in the 2026-11-16 24h UA audit slipping the old regex.
export const AB_BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|ia_archiver|whatsapp|telegram|lighthouse|gtmetrix|pingdom|headlesschrome|phantomjs|prerender|monitor|uptime|statuscake|infrawatch|scan|probe|curl|wget|python|python-requests|httpx|aiohttp|go-http|go-http-client|okhttp|axios|node-fetch|libwww|scrapy|bytespider|gptbot|claudebot|perplexitybot|amazonbot|slackbot|zgrab|censys|forestengine|google-lens|palo alto|java\//i

/**
 * Bot by headers: empty/placeholder UA, UA matching the regex, or a "browser"
 * that sends no Accept-Language. Every real browser sends Accept-Language on a
 * document navigation; the crawlers that slip the UA regex (perfect Chrome UA
 * strings) almost never bother. This is the serving-side gate — the COUNTING
 * gate is stricter still (the client-side beacon: no JS, no visitor).
 */
export function abIsBot(ua: string | null, acceptLanguage: string | null): boolean {
  return !ua || ua.trim() === '-' || !acceptLanguage || AB_BOT_RE.test(ua)
}
