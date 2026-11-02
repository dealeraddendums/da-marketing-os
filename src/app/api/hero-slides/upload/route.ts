// Hero slide image upload — accepts png/jpg/webp, converts to WebP ≤ 300 KB
// server-side (sharp: cap width at 1600px, step quality down until it fits),
// and writes to public/images/hero/ so Next serves it like any static asset.
// Files land outside git on the server; the two seed images are committed.
import { NextRequest, NextResponse } from 'next/server'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { isAdminRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_OUTPUT_BYTES = 300 * 1024
const MAX_INPUT_BYTES = 15 * 1024 * 1024
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Send the image as multipart field "file"' }, { status: 400 })
  }
  if (!ACCEPTED.includes(file.type)) {
    return NextResponse.json({ error: 'Only PNG, JPG, or WebP images are accepted' }, { status: 400 })
  }
  if (file.size > MAX_INPUT_BYTES) {
    return NextResponse.json({ error: 'Image too large (max 15 MB upload)' }, { status: 400 })
  }

  const input = Buffer.from(await file.arrayBuffer())

  // Convert to WebP, stepping quality down until it fits under 300 KB.
  let output: Buffer | null = null
  try {
    const base = sharp(input).rotate().resize({ width: 1600, withoutEnlargement: true })
    for (const quality of [82, 72, 62, 52, 42, 32]) {
      const candidate = await base.clone().webp({ quality }).toBuffer()
      output = candidate
      if (candidate.length <= MAX_OUTPUT_BYTES) break
    }
  } catch {
    return NextResponse.json({ error: 'Could not read that image — is the file valid?' }, { status: 400 })
  }
  if (!output) return NextResponse.json({ error: 'Image conversion failed' }, { status: 500 })
  if (output.length > MAX_OUTPUT_BYTES) {
    return NextResponse.json(
      { error: 'Image could not be compressed under 300 KB — try a smaller or simpler image' },
      { status: 400 },
    )
  }

  const meta = await sharp(output).metadata()
  const slug = (file.name.replace(/\.[^.]+$/, '') || 'slide')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'slide'
  const name = `${slug}-${Date.now()}.webp`

  const dir = path.join(process.cwd(), 'public', 'images', 'hero')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, name), output)

  return NextResponse.json({
    path: `/images/hero/${name}`,
    bytes: output.length,
    width: meta.width ?? null,
    height: meta.height ?? null,
  })
}
