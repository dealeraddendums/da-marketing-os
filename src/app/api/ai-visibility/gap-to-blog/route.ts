import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { supabase } from '@/lib/supabase'
import { dbSavePost, dbSlugExists } from '@/lib/blog-store'
import type { BlogFrontmatter } from '@/lib/blog'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ai-visibility/gap-to-blog { prompt_id, engines?, competitors? }
 *
 * Turn a visibility gap into a DRAFT blog topic in the existing blog pipeline
 * (the same `blog_posts` store the editor and generator use). Nothing is
 * published: the row is status 'draft' with an [ALLAN: …] note in the body, so
 * the existing publish guard blocks it until a human writes the post (use the
 * Blog & Social tab's generator on it).
 */

const slugify = (s: string) =>
  s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

export async function POST(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { prompt_id?: string; engines?: string[]; competitors?: string[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const promptId = body.prompt_id || ''
  if (!/^[0-9a-f-]{36}$/i.test(promptId)) {
    return NextResponse.json({ error: 'prompt_id required' }, { status: 400 })
  }

  const { data: prompt, error } = await supabase.from('ai_visibility_prompts')
    .select('id, prompt_text, category')
    .eq('id', promptId)
    .single()
  if (error || !prompt) return NextResponse.json({ error: 'Prompt not found' }, { status: 404 })

  const engines = (body.engines || []).filter(Boolean).join(', ') || 'multiple engines'
  const competitors = (body.competitors || []).filter(Boolean).join(', ') || 'competitors'

  let slug = slugify(prompt.prompt_text) || `ai-visibility-gap-${Date.now()}`
  if (await dbSlugExists(slug)) {
    let n = 2
    while (await dbSlugExists(`${slug}-${n}`)) n += 1
    slug = `${slug}-${n}`
  }

  const today = new Date().toISOString().slice(0, 10)
  const fm: BlogFrontmatter = {
    title: prompt.prompt_text,
    date: today,
    status: 'draft',
    tags: ['ai-visibility-gap', prompt.category],
    editorNote:
      `AI Visibility gap (${today}): when dealers ask this, ${engines} named ${competitors} and did not mention DealerAddendums. ` +
      'Write the on-domain answer so AI engines have a DealerAddendums page to cite.',
  }
  const bodyMdx =
    `[ALLAN: Draft topic created from the AI Visibility tab on ${today} — not written yet. ` +
    `Gap: ${engines} answered this question citing ${competitors}, with no DealerAddendums mention. ` +
    `Use the Blog & Social generator on this title, then delete this note.]\n\n` +
    `## Why this post\n\n` +
    `Dealers ask AI assistants: "${prompt.prompt_text}" — and today the engines answer with ` +
    `${competitors} instead of us. This post is the citable, on-domain answer.\n`

  try {
    const row = await dbSavePost(slug, fm, bodyMdx)
    return NextResponse.json({ ok: true, slug: row.slug, id: row.id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Save failed' }, { status: 500 })
  }
}
