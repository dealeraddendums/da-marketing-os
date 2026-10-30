// GET /api/brands — server-side proxy to DA Platform's /api/self-serve/brands
// (Phase 6c signup form: the selectable brand list + name inference). The
// SELF_SERVE_API_KEY never reaches the browser, same pattern as /api/check-email.
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const base = process.env.DA_PLATFORM_URL
  const key = process.env.SELF_SERVE_API_KEY
  if (!base || !key) return NextResponse.json({ brands: [] })
  const infer = req.nextUrl.searchParams.get('infer')
  const url = `${base.replace(/\/$/, '')}/api/self-serve/brands${infer ? `?infer=${encodeURIComponent(infer.slice(0, 120))}` : ''}`
  try {
    const res = await fetch(url, { headers: { 'X-API-Key': key }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return NextResponse.json({ brands: [] })
    const j = await res.json()
    return NextResponse.json({ brands: j.brands ?? [], inferred: j.inferred ?? null },
      // The list changes when the LogoForge library does — rarely. Let the edge hold it briefly.
      { headers: { 'Cache-Control': infer ? 'no-store' : 'public, max-age=300' } })
  } catch {
    return NextResponse.json({ brands: [] })
  }
}
