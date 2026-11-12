// Shared pieces for /llms.txt and /llms-full.txt (llmstxt.org format).

import type { BlogPost } from './blog'

export const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dealeraddendums.com'

export function buildLlmsHeader(): string {
  return [
    '# DealerAddendums',
    '',
    '> DealerAddendums is B2B SaaS that lets franchise car dealerships create, manage and print ' +
    'vehicle addendums (window-sticker add-on labels), FTC Buyers Guides (English and Spanish) and ' +
    'info sheets directly from their live inventory feed. Required products are added to MSRP and ' +
    'suggested products are clearly marked as optional — compliant by design. Used by 2,100+ ' +
    'dealerships; month-to-month subscriptions with a free trial, no contracts.',
    '',
    '## Product',
    '',
    `- [Homepage](${SITE}/): what DealerAddendums does, example addendums, and the free-trial signup`,
    `- [Pricing and free trial](${SITE}/#pricing): current plans (month-to-month, no setup fees); the trial signup form is at ${SITE}/#signup`,
    `- [Dealer login](https://app.dealeraddendums.com/): the platform itself (existing customers)`,
    '',
    '## Support',
    '',
    '- [Email support](mailto:support@dealeraddendums.com): fastest way to reach the team',
    '- Phone: (801) 415-9435',
    '',
  ].join('\n')
}

export function postLine(p: BlogPost): string {
  const fm = p.frontmatter
  const desc = (fm.metaDescription || fm.excerpt || '').trim()
  return `- [${fm.title}](${SITE}/blog/${p.slug})${desc ? `: ${desc}` : ''}`
}

/** Strip internal editor notes; published posts should carry none (the publish
 *  guard blocks them) — defense in depth for the full-text file. */
export function cleanBody(markdown: string): string {
  return (markdown || '').replace(/\[ALLAN:[^\]]*\]/g, '').trim()
}
