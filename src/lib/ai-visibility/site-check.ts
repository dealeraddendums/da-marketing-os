// AI Visibility — technical site-readiness check (report only, fixes are
// Allan's call). Fetches the live marketing site and reports:
//   - robots.txt verdicts for the AI crawlers that feed answer engines
//   - whether /llms.txt exists
//   - JSON-LD structured data on the homepage (Organization,
//     SoftwareApplication) and on the newest published blog post
//     (Article/BlogPosting, FAQPage)

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dealeraddendums.com'

export const AI_BOTS = ['GPTBot', 'Google-Extended', 'PerplexityBot', 'ClaudeBot', 'Bingbot']

export interface BotVerdict {
  bot: string
  /** 'allowed' | 'blocked' | 'partial' | 'default (*)' */
  verdict: string
  rules: string[]
  matchedGroup: string
}

export interface SiteCheck {
  checkedAt: string
  site: string
  robots: { found: boolean; bots: BotVerdict[]; error?: string }
  llmsTxt: { found: boolean; detail: string }
  homepage: { fetched: boolean; jsonLdTypes: string[]; hasOrganization: boolean; hasSoftwareApplication: boolean; error?: string }
  blogPost: { slug: string | null; fetched: boolean; jsonLdTypes: string[]; hasArticle: boolean; hasFaqPage: boolean; error?: string }
}

async function fetchText(url: string, maxBytes = 500_000): Promise<{ status: number; text: string; contentType: string }> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'DA-MarketingOS-SiteCheck/1.0' },
    cache: 'no-store',
    redirect: 'follow',
  })
  const text = (await res.text()).slice(0, maxBytes)
  return { status: res.status, text, contentType: res.headers.get('content-type') || '' }
}

/**
 * Minimal robots.txt evaluation: find the group whose User-agent most
 * specifically matches the bot (exact name beats '*'), then report its
 * Allow/Disallow lines. "blocked" = `Disallow: /` in the matched group.
 */
export function evaluateRobots(robotsTxt: string, bot: string): BotVerdict {
  interface Group { agents: string[]; rules: string[] }
  const groups: Group[] = []
  let current: Group | null = null
  let lastWasAgent = false

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/)
    if (!m) continue
    const field = m[1].toLowerCase()
    const value = m[2].trim()
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else if (field === 'allow' || field === 'disallow') {
      if (current) current.rules.push(`${field === 'allow' ? 'Allow' : 'Disallow'}: ${value}`)
      lastWasAgent = false
    } else {
      lastWasAgent = false
    }
  }

  const botLower = bot.toLowerCase()
  const exact = groups.find(g => g.agents.indexOf(botLower) !== -1)
  const star = groups.find(g => g.agents.indexOf('*') !== -1)
  const matched = exact || star

  if (!matched) {
    return { bot, verdict: 'allowed', rules: [], matchedGroup: 'none (no rules → allowed)' }
  }
  const disallows = matched.rules.filter(r => r.startsWith('Disallow:'))
  const blockedAll = disallows.some(r => /^Disallow:\s*\/\s*$/.test(r))
  const verdict = blockedAll ? 'blocked'
    : disallows.length && disallows.some(r => r.replace('Disallow:', '').trim() !== '') ? 'partial'
    : 'allowed'
  return {
    bot,
    verdict: exact ? verdict : `${verdict} (via *)`,
    rules: matched.rules.slice(0, 10),
    matchedGroup: exact ? bot : '*',
  }
}

/** Every @type in the page's ld+json blocks, @graph and nesting included. */
export function jsonLdTypes(html: string): string[] {
  const types: string[] = []
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  const collect = (node: unknown) => {
    if (!node) return
    if (Array.isArray(node)) { for (const n of node) collect(n); return }
    if (typeof node === 'object') {
      const t = (node as Record<string, unknown>)['@type']
      if (typeof t === 'string') { if (types.indexOf(t) === -1) types.push(t) }
      else if (Array.isArray(t)) for (const x of t) {
        if (typeof x === 'string' && types.indexOf(x) === -1) types.push(x)
      }
      for (const key of Object.keys(node as Record<string, unknown>)) {
        collect((node as Record<string, unknown>)[key])
      }
    }
  }
  while ((m = re.exec(html)) !== null) {
    try { collect(JSON.parse(m[1])) } catch { /* malformed block — skip */ }
  }
  return types
}

export async function runSiteCheck(): Promise<SiteCheck> {
  const out: SiteCheck = {
    checkedAt: new Date().toISOString(),
    site: SITE,
    robots: { found: false, bots: [] },
    llmsTxt: { found: false, detail: '' },
    homepage: { fetched: false, jsonLdTypes: [], hasOrganization: false, hasSoftwareApplication: false },
    blogPost: { slug: null, fetched: false, jsonLdTypes: [], hasArticle: false, hasFaqPage: false },
  }

  // robots.txt
  try {
    const r = await fetchText(`${SITE}/robots.txt`)
    if (r.status === 200 && !/<html/i.test(r.text.slice(0, 200))) {
      out.robots.found = true
      out.robots.bots = AI_BOTS.map(b => evaluateRobots(r.text, b))
    } else {
      out.robots.error = `HTTP ${r.status}${/<html/i.test(r.text.slice(0, 200)) ? ' (HTML page, not robots.txt)' : ''}`
      // No robots.txt means everything is allowed.
      out.robots.bots = AI_BOTS.map(b => ({
        bot: b, verdict: 'allowed', rules: [], matchedGroup: 'none (no robots.txt → allowed)',
      }))
    }
  } catch (e) {
    out.robots.error = e instanceof Error ? e.message : String(e)
  }

  // llms.txt
  try {
    const r = await fetchText(`${SITE}/llms.txt`)
    const isHtml = /<html/i.test(r.text.slice(0, 200))
    out.llmsTxt.found = r.status === 200 && !isHtml
    out.llmsTxt.detail = r.status === 200
      ? (isHtml ? 'returns an HTML page (likely a 404 fallback), not a text file' : `present (${r.text.length} bytes)`)
      : `HTTP ${r.status}`
  } catch (e) {
    out.llmsTxt.detail = e instanceof Error ? e.message : String(e)
  }

  // Homepage JSON-LD
  try {
    const r = await fetchText(`${SITE}/`)
    out.homepage.fetched = r.status === 200
    if (r.status === 200) {
      out.homepage.jsonLdTypes = jsonLdTypes(r.text)
      out.homepage.hasOrganization = out.homepage.jsonLdTypes.indexOf('Organization') !== -1
      out.homepage.hasSoftwareApplication = out.homepage.jsonLdTypes.indexOf('SoftwareApplication') !== -1
    } else out.homepage.error = `HTTP ${r.status}`
  } catch (e) {
    out.homepage.error = e instanceof Error ? e.message : String(e)
  }

  // Newest published blog post JSON-LD
  try {
    const { dbGetAllPosts } = await import('@/lib/blog-store')
    const posts = await dbGetAllPosts(true)
    const published = posts
      .filter(p => p.status === 'published')
      .sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))
    const slug = published[0]?.slug || null
    out.blogPost.slug = slug
    if (slug) {
      const r = await fetchText(`${SITE}/blog/${slug}`)
      out.blogPost.fetched = r.status === 200
      if (r.status === 200) {
        out.blogPost.jsonLdTypes = jsonLdTypes(r.text)
        out.blogPost.hasArticle = out.blogPost.jsonLdTypes.some(
          t => t === 'Article' || t === 'BlogPosting' || t === 'NewsArticle')
        out.blogPost.hasFaqPage = out.blogPost.jsonLdTypes.indexOf('FAQPage') !== -1
      } else out.blogPost.error = `HTTP ${r.status}`
    }
  } catch (e) {
    out.blogPost.error = e instanceof Error ? e.message : String(e)
  }

  return out
}
