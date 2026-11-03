// Serve hero-slide images uploaded at runtime.
//
// The admin upload route writes WebP files into public/images/hero/, but Next
// only serves public/ assets that existed AT BUILD TIME — anything added at
// runtime 404s until the next deploy's build re-snapshots the directory
// (observed live 2026-11-03: fresh uploads 404'd while the committed seed
// images served fine, so the admin preview and the homepage slider showed a
// broken image). Static files that WERE in the build still win over this
// route; newer uploads fall through to it and are streamed from disk, so
// /images/hero/<name> works for both without changing any stored image_path.
import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Upload-route filenames are slug + timestamp + .webp; the committed seeds are
// plain slugs. Anything else (dotfiles, traversal, other extensions) is a 404.
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,80}\.webp$/

export async function GET(_req: NextRequest, { params }: { params: { name: string } }) {
  const name = params.name
  if (!NAME_RE.test(name)) return new NextResponse('Not found', { status: 404 })

  try {
    const file = await readFile(path.join(process.cwd(), 'public', 'images', 'hero', name))
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'image/webp',
        // Filenames carry a timestamp, so they never change content in place.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
