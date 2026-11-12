// /llms-full.txt — the llms.txt index with every published blog post's full
// markdown inlined, so an AI assistant can ingest the whole knowledge base in
// one fetch. Request-time generation from the live blog store.

import { getAllPosts } from '@/lib/blog'
import { buildLlmsHeader, cleanBody, SITE } from '@/lib/llms-txt'

export const dynamic = 'force-dynamic'

export async function GET() {
  const posts = await getAllPosts()
  const parts: string[] = [buildLlmsHeader(), '## Blog (full text)', '']
  for (const p of posts) {
    const fm = p.frontmatter
    parts.push(`---`)
    parts.push('')
    parts.push(`# ${fm.title}`)
    parts.push('')
    parts.push(`Source: ${SITE}/blog/${p.slug}`)
    parts.push(`Published: ${fm.date}${fm.updatedAt ? ` · Updated: ${fm.updatedAt}` : ''}`)
    parts.push('')
    parts.push(cleanBody(p.content))
    parts.push('')
  }
  return new Response(parts.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
