import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ai-visibility/manage — the Prompt manager's write path.
 *
 * Body: { kind: 'prompt' | 'competitor', action: 'create' | 'update' | 'delete',
 *         id?, fields? }
 *
 * Deactivating (active=false) is the normal way to retire a prompt — history
 * stays attached. Hard delete cascades that prompt's results away, so the UI
 * reserves it for mistakes; the API allows both.
 */

const PROMPT_FIELDS = ['prompt_text', 'category', 'active', 'sort_order']
const COMPETITOR_FIELDS = ['name', 'domains', 'aliases', 'active']
const CATEGORIES = ['addendums', 'compliance', 'buyers_guide', 'pricing', 'competitors']

export async function POST(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  const kind = body.kind === 'competitor' ? 'competitor' : body.kind === 'prompt' ? 'prompt' : null
  const action = typeof body.action === 'string' ? body.action : ''
  const id = typeof body.id === 'string' ? body.id : ''
  const rawFields = (body.fields && typeof body.fields === 'object') ? body.fields as Record<string, unknown> : {}
  if (!kind || ['create', 'update', 'delete'].indexOf(action) === -1) {
    return NextResponse.json({ error: 'kind must be prompt|competitor, action must be create|update|delete' }, { status: 400 })
  }

  const table = kind === 'prompt' ? 'ai_visibility_prompts' : 'ai_visibility_competitors'
  const allowed = kind === 'prompt' ? PROMPT_FIELDS : COMPETITOR_FIELDS
  const fields: Record<string, unknown> = {}
  for (const k of allowed) if (k in rawFields) fields[k] = rawFields[k]

  // Light validation — the DB checks the rest.
  if ('prompt_text' in fields && !String(fields.prompt_text || '').trim()) {
    return NextResponse.json({ error: 'prompt_text is required' }, { status: 400 })
  }
  if ('category' in fields && CATEGORIES.indexOf(String(fields.category)) === -1) {
    return NextResponse.json({ error: `category must be one of ${CATEGORIES.join(', ')}` }, { status: 400 })
  }
  if ('name' in fields && !String(fields.name || '').trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  for (const listKey of ['domains', 'aliases']) {
    if (listKey in fields && !Array.isArray(fields[listKey])) {
      return NextResponse.json({ error: `${listKey} must be an array of strings` }, { status: 400 })
    }
  }

  if (action === 'create') {
    const { data, error } = await supabase.from(table).insert(fields).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, row: data })
  }

  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })

  if (action === 'update') {
    if (!Object.keys(fields).length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    const { data, error } = await supabase.from(table).update(fields).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, row: data })
  }

  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
