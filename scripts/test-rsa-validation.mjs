// Unit tests for validateRsa — run with: npm run test:rsa
//
// There is no test framework in this project, so this is a plain script that
// exits non-zero on failure.
//
// It tests the REAL exported function, not a copy: ads-write.ts is transpiled
// with the TypeScript compiler already in devDependencies and loaded in a
// CommonJS sandbox whose `require` is stubbed for the two Google modules it
// imports. Those imports are never reached — validateRsa is pure — but they
// have to resolve for the module to evaluate. The alternative (re-implementing
// the rules here) would drift silently, which is the one failure mode a
// validation test must not have.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Module from 'node:module'
import ts from 'typescript'

const here = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(here, '..', 'src', 'lib', 'google', 'ads-write.ts')
const source = readFileSync(file, 'utf8')

const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: 'ads-write.ts',
})

const sandbox = new Module('ads-write-under-test')
sandbox.require = (id) => {
  // Stubs: validateRsa touches neither, but the module body imports them.
  if (id === './oauth') return { getAccessToken: async () => 'stub-token' }
  if (id === './config') return { normalizeCustomerId: (s) => String(s ?? '').replace(/[^0-9]/g, '') }
  return Module.createRequire(file)(id)
}
sandbox._compile(outputText, file)
const { validateRsa, RSA_LIMITS } = sandbox.exports

if (typeof validateRsa !== 'function') {
  console.error('validateRsa was not exported — the test could not load the real function')
  process.exit(1)
}

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const H = (n) => Array.from({ length: n }, (_, i) => `Dealer Addendums ${i + 1}`.slice(0, 30))
const D = (n) => Array.from({ length: n }, (_, i) => `Print compliant window labels fast ${i + 1}`.slice(0, 90))
const base = (over = {}) => ({
  headlines: H(5), descriptions: D(2),
  finalUrls: ['https://www.dealeraddendums.com/'], ...over,
})
const errs = (draft) => JSON.stringify(validateRsa(draft).errors)

console.log(`validateRsa  (limits: ${RSA_LIMITS.maxHeadlines}×${RSA_LIMITS.headlineMaxChars} headlines, ` +
            `${RSA_LIMITS.maxDescriptions}×${RSA_LIMITS.descriptionMaxChars} descriptions)`)

// ── Happy path ──────────────────────────────────────────────────────────────
check('a well-formed draft passes', validateRsa(base()).ok, errs(base()))
check('15 headlines / 4 descriptions is legal',
  validateRsa(base({ headlines: H(15), descriptions: D(4) })).ok)

// ── Counts ──────────────────────────────────────────────────────────────────
check('rejects 16 headlines', !validateRsa(base({ headlines: H(16) })).ok)
check('rejects 2 headlines (below minimum)', !validateRsa(base({ headlines: H(2) })).ok)
check('rejects 5 descriptions', !validateRsa(base({ descriptions: D(5) })).ok)
check('rejects 1 description (below minimum)', !validateRsa(base({ descriptions: D(1) })).ok)

// ── Lengths: exact boundaries ───────────────────────────────────────────────
const h30 = 'a'.repeat(30), h31 = 'a'.repeat(31)
const d90 = 'b'.repeat(90), d91 = 'b'.repeat(91)
check('headline of exactly 30 chars is allowed',
  validateRsa(base({ headlines: [h30, 'two', 'three'] })).ok)
check('headline of 31 chars is rejected',
  !validateRsa(base({ headlines: [h31, 'two', 'three'] })).ok)
check('description of exactly 90 chars is allowed',
  validateRsa(base({ descriptions: [d90, 'second description'] })).ok)
check('description of 91 chars is rejected',
  !validateRsa(base({ descriptions: [d91, 'second description'] })).ok)

// ── Code points, not UTF-16 units ───────────────────────────────────────────
// 30 astral characters are 60 UTF-16 units; a naive .length would reject this
// legal headline.
check('30 astral characters counts as 30, not 60',
  validateRsa(base({ headlines: ['𝐀'.repeat(30), 'two', 'three'] })).ok,
  errs(base({ headlines: ['𝐀'.repeat(30), 'two', 'three'] })))
check('31 astral characters is still rejected',
  !validateRsa(base({ headlines: ['𝐀'.repeat(31), 'two', 'three'] })).ok)

// ── Content rules ───────────────────────────────────────────────────────────
check('rejects an empty headline', !validateRsa(base({ headlines: ['ok', '   ', 'three'] })).ok)
check('rejects duplicate headlines (case-insensitive)',
  !validateRsa(base({ headlines: ['Window Labels', 'window labels', 'three'] })).ok)
check('rejects a path over 15 chars', !validateRsa(base({ path1: 'a'.repeat(16) })).ok)
check('allows a path of exactly 15 chars', validateRsa(base({ path1: 'a'.repeat(15) })).ok)

// ── Final URL ───────────────────────────────────────────────────────────────
check('requires a final URL', !validateRsa(base({ finalUrls: [] })).ok)
check('rejects a non-https final URL',
  !validateRsa(base({ finalUrls: ['http://www.dealeraddendums.com/'] })).ok)

// ── Error reporting ─────────────────────────────────────────────────────────
const multi = validateRsa({ headlines: [h31], descriptions: [], finalUrls: [] })
check('reports every problem at once, not just the first',
  multi.errors.length >= 3, `got ${multi.errors.length}: ${JSON.stringify(multi.errors)}`)
check('an over-length error quotes the offending length',
  validateRsa(base({ headlines: [h31, 'two', 'three'] })).errors.some(e => e.includes('31 chars')))

// ── Defensive: malformed input must not throw ───────────────────────────────
let threw = false
try { validateRsa({}) } catch { threw = true }
check('an empty object is a validation failure, not a crash', !threw)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
