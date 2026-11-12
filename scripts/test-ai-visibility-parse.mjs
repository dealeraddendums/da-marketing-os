// Unit tests for the AI Visibility answer parser — run with:
//   npm run test:ai-visibility
//
// The parser decides the headline metric (da_mentioned) and the competitive
// read (competitors_mentioned, position_rank), so the failure modes that
// matter are OVERSTATEMENT (counting "ACDKit" as CDK, or a search result the
// engine never cited as a citation) and UNDERSTATEMENT (missing
// "Dealer Addendums" with a space, or a bare-domain Gemini citation).
//
// Same harness as test-experiments.mjs: the REAL exported functions are
// transpiled and loaded, never re-implemented here.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Module from 'node:module'
import ts from 'typescript'

const here = path.dirname(fileURLToPath(import.meta.url))

function loadTs(relPath, stubs = {}) {
  const file = path.join(here, '..', relPath)
  const source = readFileSync(file, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: path.basename(file),
  })
  const sandbox = new Module(relPath)
  sandbox.require = (id) => {
    if (id in stubs) return stubs[id]
    // Type-only sibling imports are erased by transpile; anything left over
    // resolves normally.
    return Module.createRequire(file)(id)
  }
  sandbox._compile(outputText, file)
  return sandbox.exports
}

const { parseAnswer, domainOf, urlsIn, firstNameIndex } = loadTs('src/lib/ai-visibility/parse.ts')
const { evaluateRobots, jsonLdTypes } = loadTs('src/lib/ai-visibility/site-check.ts', {
  '@/lib/blog-store': {}, // only used inside runSiteCheck, which these tests never call
})

if (typeof parseAnswer !== 'function') {
  console.error('parseAnswer was not exported — the test could not load the real function')
  process.exit(1)
}

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// A competitor set shaped like the seeded table.
const comp = (name, domains = [], aliases = [], active = true) =>
  ({ id: name, name, domains, aliases, active })
const COMPETITORS = [
  comp('ComplyAuto', ['complyauto.com']),
  comp('CDK Global', ['cdkglobal.com'], ['CDK']),
  comp('Frazer', ['frazer.com'], ['Frazer DMS']),
  comp('Versa-Tags', ['versatags.com'], ['Versa Tags']),
  comp('Inactive Vendor', ['inactive.com'], [], false),
]

console.log('parseAnswer — AI Visibility answer parsing\n')

// ── DA detection ─────────────────────────────────────────────────────────────
{
  const r = parseAnswer('Dealerships often use DealerAddendums for this.', [], COMPETITORS)
  check('DA name (one word) detected', r.da_mentioned === true)
  check('rank 1 when DA is the only vendor', r.position_rank === 1, `got ${r.position_rank}`)
}
{
  const r = parseAnswer('Dealer Addendums is a popular choice.', [], COMPETITORS)
  check('DA name with a space detected', r.da_mentioned === true)
}
{
  const r = parseAnswer('See dealeraddendums.com for details.', [], COMPETITORS)
  check('DA bare domain in prose detected', r.da_mentioned === true)
}
{
  const r = parseAnswer('No vendors mentioned here.', ['https://www.dealeraddendums.com/blog/post'], COMPETITORS)
  check('DA citation alone counts as mentioned', r.da_mentioned === true)
  check('da_cited_url taken from citations', r.da_cited_url === 'https://www.dealeraddendums.com/blog/post')
  check('no position_rank when DA absent from the text', r.position_rank === null)
}
{
  const r = parseAnswer('Nothing about us at all.', [], COMPETITORS)
  check('absent DA → not mentioned', r.da_mentioned === false)
  check('absent DA → null cited url', r.da_cited_url === null)
}
{
  const r = parseAnswer(
    'Try https://dealeraddendums.com/pricing, it is solid.', [], COMPETITORS)
  check('da_cited_url found in answer text, trailing comma stripped',
    r.da_cited_url === 'https://dealeraddendums.com/pricing', r.da_cited_url)
}
{
  const r = parseAnswer('No text mention.', ['dealeraddendums.com'], COMPETITORS)
  check('bare-domain citation (Gemini style) yields a url',
    r.da_cited_url === 'https://dealeraddendums.com', r.da_cited_url)
}
{
  const r = parseAnswer('Their dealeraddendumsy tool...', [], COMPETITORS)
  check('"dealeraddendumsy" does not count as the domain', r.da_mentioned === false)
}

// ── Competitor matching ──────────────────────────────────────────────────────
{
  const r = parseAnswer('ComplyAuto and CDK are common picks.', [], COMPETITORS)
  check('competitor by name', r.competitors_mentioned.indexOf('ComplyAuto') !== -1)
  check('competitor by alias (CDK)', r.competitors_mentioned.indexOf('CDK Global') !== -1)
}
{
  const r = parseAnswer('Check out complyauto.com for compliance.', [], COMPETITORS)
  check('competitor by domain in prose', eq(r.competitors_mentioned, ['ComplyAuto']))
}
{
  const r = parseAnswer('Nothing in the text.', ['https://www.frazer.com/products'], COMPETITORS)
  check('competitor by citation domain', eq(r.competitors_mentioned, ['Frazer']))
}
{
  const r = parseAnswer('The ACDKit library handles this.', [], COMPETITORS)
  check('alias needs word boundaries (ACDKit is not CDK)', r.competitors_mentioned.length === 0,
    JSON.stringify(r.competitors_mentioned))
}
{
  const r = parseAnswer('Versa Tags sells supplies; so does Versa-Tags.', [], COMPETITORS)
  check('hyphen/space alias variants both match once', eq(r.competitors_mentioned, ['Versa-Tags']))
}
{
  const r = parseAnswer('Inactive Vendor is great, see inactive.com.', [], COMPETITORS)
  check('inactive competitors are ignored', r.competitors_mentioned.length === 0)
}
{
  const r = parseAnswer('frazer is lowercase here.', [], COMPETITORS)
  check('matching is case-insensitive', eq(r.competitors_mentioned, ['Frazer']))
}

// ── position_rank ────────────────────────────────────────────────────────────
{
  const r = parseAnswer('ComplyAuto leads, then DealerAddendums, then Frazer.', [], COMPETITORS)
  check('DA second → rank 2', r.position_rank === 2, `got ${r.position_rank}`)
}
{
  const r = parseAnswer('DealerAddendums first; ComplyAuto and Frazer after.', [], COMPETITORS)
  check('DA first → rank 1', r.position_rank === 1, `got ${r.position_rank}`)
}
{
  const r = parseAnswer('ComplyAuto, Frazer, CDK... and finally DealerAddendums.', [], COMPETITORS)
  check('DA after three vendors → rank 4', r.position_rank === 4, `got ${r.position_rank}`)
}
{
  const r = parseAnswer('DealerAddendums is one option.', ['https://complyauto.com/x'], COMPETITORS)
  check('citation-only competitor does not affect rank', r.position_rank === 1, `got ${r.position_rank}`)
  check('…but still counts as mentioned', eq(r.competitors_mentioned, ['ComplyAuto']))
}

// ── cited_domains ────────────────────────────────────────────────────────────
{
  const r = parseAnswer(
    'See https://www.complyauto.com/a and https://blog.frazer.com/b.',
    ['https://www.dealeraddendums.com/c', 'carfax.com'],
    COMPETITORS,
  )
  check('cited_domains: www stripped, subdomain kept, bare domain accepted, order preserved',
    eq(r.cited_domains, ['complyauto.com', 'blog.frazer.com', 'dealeraddendums.com', 'carfax.com']),
    JSON.stringify(r.cited_domains))
}
{
  check('domainOf strips www and lowercases', domainOf('HTTPS://WWW.Example.COM/Path') === 'example.com')
  check('domainOf rejects dotless input', domainOf('localhost') === null)
  check('urlsIn strips trailing punctuation',
    eq(urlsIn('Go to https://a.com/x. Then https://b.com/y, ok?'), ['https://a.com/x', 'https://b.com/y']))
  check('urlsIn stops at markdown bracket',
    eq(urlsIn('[link](https://a.com/x)'), ['https://a.com/x']))
  check('firstNameIndex word boundary', firstNameIndex('ACDKit only', ['CDK']) === -1)
  check('firstNameIndex finds earliest of several names',
    firstNameIndex('zzz Frazer DMS before Frazer? No — same vendor', ['Frazer', 'Frazer DMS']) === 4)
}

// ── empty / degenerate input ─────────────────────────────────────────────────
{
  const r = parseAnswer('', [], COMPETITORS)
  check('empty answer parses clean', r.da_mentioned === false && r.cited_domains.length === 0 && r.position_rank === null)
}
{
  const r = parseAnswer('DealerAddendums', [], [])
  check('no competitors defined still works', r.da_mentioned === true && r.position_rank === 1)
}

// ── site-check pure helpers ──────────────────────────────────────────────────
console.log('\nevaluateRobots / jsonLdTypes — site readiness\n')
{
  const robots = [
    'User-agent: *', 'Disallow: /admin', '',
    'User-agent: GPTBot', 'Disallow: /', '',
    'User-agent: PerplexityBot', 'Allow: /',
  ].join('\n')
  check('exact group blocks GPTBot', evaluateRobots(robots, 'GPTBot').verdict === 'blocked')
  check('exact group allows PerplexityBot', evaluateRobots(robots, 'PerplexityBot').verdict === 'allowed')
  const bing = evaluateRobots(robots, 'Bingbot')
  check('unlisted bot falls to * (partial)', bing.verdict === 'partial (via *)', bing.verdict)
  check('no robots groups → allowed', evaluateRobots('', 'ClaudeBot').verdict === 'allowed')
  const shared = evaluateRobots('User-agent: a\nUser-agent: b\nDisallow: /', 'b')
  check('stacked user-agents share one group', shared.verdict === 'blocked')
}
{
  const html = `
    <html><head>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
      {"@type":"Organization","name":"DA"},{"@type":["SoftwareApplication","Product"]}]}</script>
    <script type="application/ld+json">broken json {{{</script>
    <script type="application/ld+json">{"@type":"BlogPosting","mainEntity":{"@type":"FAQPage"}}</script>
    </head></html>`
  const types = jsonLdTypes(html)
  check('jsonLdTypes finds @graph + array types + nested, skips broken blocks',
    ['Organization', 'SoftwareApplication', 'Product', 'BlogPosting', 'FAQPage']
      .every(t => types.indexOf(t) !== -1),
    JSON.stringify(types))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
