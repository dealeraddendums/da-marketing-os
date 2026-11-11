import { NextResponse } from 'next/server'
import { getBlogRouteMap } from '@/lib/blog'

export const dynamic = 'force-dynamic'

// Public, tiny, cacheable: the middleware consults this map on /blog/<slug>
// requests to issue 301s (renamed or archived-with-replacement posts) and
// 410s (archived without replacement). It exposes nothing sensitive — only
// slugs and where they went. Middleware caches it in module scope for 60s;
// the CDN/proxy may cache it briefly too.
export async function GET() {
  const map = await getBlogRouteMap()
  return NextResponse.json(map, {
    headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
  })
}
