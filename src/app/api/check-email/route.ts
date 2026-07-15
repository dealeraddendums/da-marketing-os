import { NextRequest, NextResponse } from 'next/server'

// GET /api/check-email?email=… → { available: boolean }
//
// Server-side proxy to DA Platform's availability check. Exists so the
// signup form can query same-origin without SELF_SERVE_API_KEY ever
// shipping to the browser. Fail-open on any error — the real duplicate
// guard lives in DA Platform's provisioning (selfServeDuplicateExists);
// this is inline-UX only.

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(req: NextRequest): Promise<NextResponse> {
  const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase() ?? ''
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 })
  }

  const base = process.env.DA_PLATFORM_URL
  const key = process.env.SELF_SERVE_API_KEY
  if (!base || !key) return NextResponse.json({ available: true })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)
  try {
    const res = await fetch(
      `${base.replace(/\/$/, '')}/api/check-email?email=${encodeURIComponent(email)}`,
      { headers: { 'X-API-Key': key }, cache: 'no-store', signal: controller.signal },
    )
    if (!res.ok) return NextResponse.json({ available: true })
    const data = (await res.json()) as { available?: boolean }
    return NextResponse.json({ available: data.available !== false })
  } catch {
    return NextResponse.json({ available: true })
  } finally {
    clearTimeout(timer)
  }
}
