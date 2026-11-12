// /llms.txt — the llmstxt.org index for AI assistants and crawlers.
//
// Generated at request time from the live blog store (via lib/blog, so the
// BLOG_SOURCE rollback switch is respected) — a newly published post appears
// here with no deploy. /llms-full.txt (sibling route) inlines the post bodies.

import { getAllPosts } from '@/lib/blog'
import { buildLlmsHeader, postLine, SITE } from '@/lib/llms-txt'

export const dynamic = 'force-dynamic'

export async function GET() {
  const posts = await getAllPosts()
  const lines: string[] = [
    buildLlmsHeader(),
    '## Blog',
    '',
    ...posts.map(postLine),
    '',
    '## Full content',
    '',
    `- [llms-full.txt](${SITE}/llms-full.txt): this index with every blog post's full text inlined`,
    '',
  ]
  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
