import { NextRequest, NextResponse } from 'next/server'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const dir = join(process.cwd(), 'content', 'social')
  const posts: object[] = []

  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.json'))
    for (const file of files) {
      const items = JSON.parse(readFileSync(join(dir, file), 'utf-8'))
      if (Array.isArray(items)) {
        posts.push(...items.map((p: Record<string, unknown>) => ({ ...p, _file: file })))
      }
    }
  } catch { /* empty queue is fine */ }

  return NextResponse.json({ posts, count: posts.length })
}
