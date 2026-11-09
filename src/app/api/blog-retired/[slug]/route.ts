import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// The 410 Gone page for archived posts with no replacement. The middleware
// REWRITES /blog/<archived-slug> here, so the visitor's URL stays the same
// while the response status is a true 410 — never a noindex-but-200 page
// (a stale page that still answers 200 keeps getting cited by search engines
// and AI assistants).
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const safe = (params.slug || '').replace(/[^a-z0-9-]/gi, '')
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Article retired | DealerAddendums</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<style>
  body { margin:0; font-family: Roboto, -apple-system, sans-serif; background:#ffffff; color:#2a2b3c; }
  .nav { background:#2a2b3c; height:52px; display:flex; align-items:center; padding:0 24px; }
  .nav img { display:block; }
  .wrap { max-width:560px; margin:0 auto; padding:72px 24px; text-align:center; }
  h1 { font-size:26px; font-weight:700; margin:0 0 14px; }
  p { font-size:15px; line-height:1.7; color:#55595c; margin:0 0 28px; }
  a.btn { display:inline-block; background:#1976d2; color:#fff; text-decoration:none;
          padding:12px 28px; border-radius:4px; font-size:14px; font-weight:500; }
  a.home { display:block; margin-top:16px; font-size:13px; color:#1976d2; text-decoration:none; }
</style>
</head>
<body>
  <div class="nav"><a href="/"><img src="/images/logo-light.svg" alt="DealerAddendums" width="195" height="22"></a></div>
  <div class="wrap">
    <h1>This article has been retired</h1>
    <p>This article has been retired because the information is out of date.
       Our current guides for dealers are on the blog.</p>
    <a class="btn" href="/blog">Browse the blog</a>
    <a class="home" href="/">dealeraddendums.com</a>
  </div>
  <!-- retired: ${safe} -->
</body>
</html>`
  return new NextResponse(html, {
    status: 410,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
