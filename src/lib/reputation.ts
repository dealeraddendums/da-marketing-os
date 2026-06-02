// Shared server-side helpers for the Reputation Manager module.
import { cookies } from 'next/headers'
import { supabase, getDaPlatformSupabase } from '@/lib/supabase'
import { fetchReviewsFromGoogle, starToNumber } from '@/lib/gbp'

// ── DA design tokens (mirrors DADesignGuidelines.md) ─────────────────────────
export const DA = {
  navy: '#2a2b3c',
  orange: '#ffa500',
  blue: '#1976d2',
  blueLight: '#2196f3',
  success: '#4caf50',
  error: '#ff5252',
  warning: '#ff9800',
  bgApp: '#3a6897',
  bgSurface: '#ffffff',
  bgSubtle: '#f5f6f7',
  textPrimary: '#333333',
  textSecondary: '#55595c',
  textMuted: '#78828c',
  border: '#e0e0e0',
  borderStrong: '#c0c0c0',
} as const

// ── Auth gate (mirrors src/app/admin/page.tsx) ───────────────────────────────
export function isAdminAuthed(): boolean {
  const authCookie = cookies().get('da_admin_auth')
  return !!(process.env.ADMIN_PASSWORD && authCookie?.value === process.env.ADMIN_PASSWORD)
}

// ── Review sync: pull from GBP (stub or real) → upsert into Supabase ─────────
export async function syncReviewsToSupabase(): Promise<{ count: number; error?: string }> {
  const reviews = await fetchReviewsFromGoogle()
  if (!reviews.length) return { count: 0 }

  // Preserve workflow fields (status, ai_draft) on rows we've already seen.
  const ids = reviews.map(r => r.review_id)
  const { data: existing } = await supabase
    .from('gbp_reviews')
    .select('review_id, status, ai_draft')
    .in('review_id', ids)

  const existingMap = new Map((existing || []).map(r => [r.review_id, r]))

  const rows = reviews.map(r => {
    const prior = existingMap.get(r.review_id)
    return {
      review_id: r.review_id,
      reviewer_name: r.reviewer_name,
      reviewer_photo_url: r.reviewer_photo_url,
      star_rating: r.star_rating,
      comment: r.comment,
      create_time: r.create_time,
      update_time: r.update_time,
      reply_comment: r.reply_comment,
      reply_update_time: r.reply_update_time,
      // If Google shows a reply, reflect 'replied'; otherwise keep prior workflow status.
      status: r.reply_comment ? 'replied' : (prior?.status || 'unread'),
      ai_draft: prior?.ai_draft ?? null,
      updated_at: new Date().toISOString(),
    }
  })

  const { error } = await supabase.from('gbp_reviews').upsert(rows, { onConflict: 'review_id' })
  if (error) return { count: 0, error: error.message }
  return { count: rows.length }
}

export interface ReviewRow {
  id: string
  review_id: string
  reviewer_name: string | null
  reviewer_photo_url: string | null
  star_rating: string | null
  comment: string | null
  create_time: string | null
  update_time: string | null
  reply_comment: string | null
  reply_update_time: string | null
  status: string
  ai_draft: string | null
}

// Reads all reviews (newest first). Returns [] gracefully if the table is missing.
export async function getReviews(): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from('gbp_reviews')
    .select('*')
    .order('create_time', { ascending: false })
  if (error) return []
  return (data || []) as ReviewRow[]
}

export interface ReputationStats {
  averageRating: number
  totalReviews: number
  reviewsThisMonth: number
  responseRate: number
  unanswered: number
  requestsThisMonth: number
}

export async function getStats(): Promise<ReputationStats> {
  const reviews = await getReviews()
  const total = reviews.length
  const ratingSum = reviews.reduce((s, r) => s + starToNumber(r.star_rating), 0)
  const averageRating = total ? Math.round((ratingSum / total) * 10) / 10 : 0

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const reviewsThisMonth = reviews.filter(
    r => r.create_time && new Date(r.create_time) >= startOfMonth
  ).length

  const replied = reviews.filter(r => r.reply_comment || r.status === 'replied').length
  const responseRate = total ? Math.round((replied / total) * 100) : 0
  const unanswered = reviews.filter(
    r => !r.reply_comment && r.status !== 'replied' && r.status !== 'flagged'
  ).length

  let requestsThisMonth = 0
  const { count } = await supabase
    .from('review_requests')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', startOfMonth.toISOString())
  requestsThisMonth = count || 0

  return { averageRating, totalReviews: total, reviewsThisMonth, responseRate, unanswered, requestsThisMonth }
}

export async function getReputationSettings(): Promise<{ review_page_url: string | null }> {
  const { data } = await supabase
    .from('reputation_settings')
    .select('review_page_url')
    .eq('id', 1)
    .maybeSingle()
  return { review_page_url: data?.review_page_url ?? null }
}

// ── Active-dealer segments (read-only from DA Platform Supabase) ─────────────
export interface DealerContact {
  dealer_supabase_id: string
  dealer_name: string
  contact_name: string | null
  contact_email: string
}

export type Segment = 'active_90_days' | 'all_active' | 'manual'

// Returns dealers for a campaign segment. Reads DA Platform Supabase read-only.
// Returns { connected:false } when DA_PLATFORM_* env is not configured.
export async function getSegmentDealers(
  segment: Segment
): Promise<{ connected: boolean; dealers: DealerContact[] }> {
  const da = getDaPlatformSupabase()
  if (!da) return { connected: false, dealers: [] }

  // dealers + primary admin contact email (best-effort join via profiles/users).
  const { data: dealers, error } = await da
    .from('dealers')
    .select('id, business_name, created_at')
    .order('created_at', { ascending: true })
  if (error || !dealers) return { connected: true, dealers: [] }

  let filtered = dealers
  if (segment === 'active_90_days') {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000
    filtered = dealers.filter(d => d.created_at && new Date(d.created_at).getTime() < cutoff)
  }

  const ids = filtered.map(d => d.id)
  // Pull a primary contact per dealer from profiles (read-only).
  const contactByDealer = new Map<string, { name: string | null; email: string }>()
  if (ids.length) {
    const { data: profiles } = await da
      .from('profiles')
      .select('dealer_id, full_name, email')
      .in('dealer_id', ids)
    for (const p of profiles || []) {
      if (p.email && !contactByDealer.has(p.dealer_id)) {
        contactByDealer.set(p.dealer_id, { name: p.full_name ?? null, email: p.email })
      }
    }
  }

  // Exclude dealers we've already successfully contacted (status != 'pending')
  // for the "no review yet" segment.
  let alreadyContacted = new Set<string>()
  if (segment === 'active_90_days') {
    const { data: prior } = await supabase
      .from('review_requests')
      .select('dealer_supabase_id, status')
      .neq('status', 'pending')
    alreadyContacted = new Set((prior || []).map(r => r.dealer_supabase_id))
  }

  const out: DealerContact[] = []
  for (const d of filtered) {
    const contact = contactByDealer.get(d.id)
    if (!contact?.email) continue
    if (segment === 'active_90_days' && alreadyContacted.has(d.id)) continue
    out.push({
      dealer_supabase_id: d.id,
      dealer_name: d.business_name || 'Dealer',
      contact_name: contact.name,
      contact_email: contact.email,
    })
  }
  return { connected: true, dealers: out }
}
