// ─────────────────────────────────────────────────────────────────────────────
// GBP_STATUS: STUBBED — real Google Business Profile API pending Google approval.
//
// To activate the real API later:
//   1. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, and
//      GBP_LOCATION_NAME (accounts/XXX/locations/XXX) to .env.local.
//   2. Replace the bodies of fetchReviewsFromGoogle / postReplyToGoogle /
//      deleteReplyFromGoogle below with real GBP API calls.
//
// IMPORTANT: keep every exported function signature identical. The entire app
// (API routes + UI) talks only to these functions — swapping in the real API
// must require ZERO changes outside this file.
// ─────────────────────────────────────────────────────────────────────────────

export type StarRating = 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE'

export interface GBPReview {
  review_id: string
  reviewer_name: string
  reviewer_photo_url: string | null
  star_rating: StarRating
  comment: string
  create_time: string  // ISO
  update_time: string  // ISO
  reply_comment: string | null
  reply_update_time: string | null
}

// Real GBP is considered connected once a location resource name is configured.
export const GBP_CONNECTED = process.env.GBP_LOCATION_NAME ? true : false

// Returns reviews for DA's Google Business Profile.
// STUB: returns mock data. Replace with real GBP paginated fetch when approved.
export async function fetchReviewsFromGoogle(): Promise<GBPReview[]> {
  if (!GBP_CONNECTED) return MOCK_REVIEWS
  // TODO (real API): GET https://mybusiness.googleapis.com/v4/{locationName}/reviews
  //   - exchange refresh_token -> access_token, page through `reviews[]`,
  //     map Google's shape into GBPReview[].
  return MOCK_REVIEWS
}

// Posts (or updates) DA's reply to a review.
// STUB: logs intent and returns true so Supabase is updated optimistically.
export async function postReplyToGoogle(reviewId: string, comment: string): Promise<boolean> {
  if (!GBP_CONNECTED) {
    console.log(`[GBP STUB] Would post reply to ${reviewId}: ${comment}`)
    return true // optimistic — caller updates Supabase as if it worked
  }
  // TODO (real API): PUT https://mybusiness.googleapis.com/v4/{reviewName}/reply  { comment }
  return true
}

// Deletes DA's reply to a review.
// STUB: logs intent and returns true.
export async function deleteReplyFromGoogle(reviewId: string): Promise<boolean> {
  if (!GBP_CONNECTED) {
    console.log(`[GBP STUB] Would delete reply on ${reviewId}`)
    return true
  }
  // TODO (real API): DELETE https://mybusiness.googleapis.com/v4/{reviewName}/reply
  return true
}

// ── Mock data ────────────────────────────────────────────────────────────────
// 8 realistic DealerAddendums Google reviews, mostly 4–5★ with one 3★ and one 2★,
// dated across the last ~6 months. Makes the inbox immediately usable/demoable.
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

export const MOCK_REVIEWS: GBPReview[] = [
  {
    review_id: 'mock/AbFvOq-001',
    reviewer_name: 'Marcus Whitfield',
    reviewer_photo_url: null,
    star_rating: 'FIVE',
    comment:
      "We run three Ford rooftops and DealerAddendums saves my sales team hours every week. The addendums print clean and the auto-apply by trim is spot on. Support actually picks up the phone. Couldn't ask for more.",
    create_time: daysAgo(8),
    update_time: daysAgo(8),
    reply_comment: null,
    reply_update_time: null,
  },
  {
    review_id: 'mock/AbFvOq-002',
    reviewer_name: 'Priya Nair',
    reviewer_photo_url: null,
    star_rating: 'FIVE',
    comment:
      "Switched from doing buyers guides by hand to DealerAddendums and it's night and day. English and Spanish guides print in seconds. Onboarding was painless and they had us set up the same afternoon.",
    create_time: daysAgo(21),
    update_time: daysAgo(20),
    reply_comment:
      "Thank you so much, Priya! We're thrilled the buyers guides are saving your team time. Reach out anytime — we're here 24/7.",
    reply_update_time: daysAgo(19),
  },
  {
    review_id: 'mock/AbFvOq-003',
    reviewer_name: 'Tobias Renner',
    reviewer_photo_url: null,
    star_rating: 'FOUR',
    comment:
      "Solid product that does exactly what it promises. Addendums look professional and the pricing is fair for a single-point store. Took me a day to get comfortable with the template builder but it's powerful once you do.",
    create_time: daysAgo(34),
    update_time: daysAgo(34),
    reply_comment: null,
    reply_update_time: null,
  },
  {
    review_id: 'mock/AbFvOq-004',
    reviewer_name: 'Danielle Crews',
    reviewer_photo_url: null,
    star_rating: 'FIVE',
    comment:
      "Our F&I process got noticeably smoother. The info sheets are consistent across every vehicle and our compliance team loves the paper trail. Highly recommend for any franchise dealer.",
    create_time: daysAgo(52),
    update_time: daysAgo(52),
    reply_comment: null,
    reply_update_time: null,
  },
  {
    review_id: 'mock/AbFvOq-005',
    reviewer_name: 'Hector Salinas',
    reviewer_photo_url: null,
    star_rating: 'THREE',
    comment:
      "The software itself works well and the addendums look great. Knocking off a couple stars because the initial DMS integration took longer than I expected and I had to follow up a few times. Once it was connected it's been reliable.",
    create_time: daysAgo(73),
    update_time: daysAgo(73),
    reply_comment: null,
    reply_update_time: null,
  },
  {
    review_id: 'mock/AbFvOq-006',
    reviewer_name: 'Jenna Albright',
    reviewer_photo_url: null,
    star_rating: 'FIVE',
    comment:
      "Been a customer since 2019 across our used car group. Month-to-month with no contract is exactly how a vendor should operate. The new VIN scan app is a nice touch for the lot.",
    create_time: daysAgo(96),
    update_time: daysAgo(96),
    reply_comment: null,
    reply_update_time: null,
  },
  {
    review_id: 'mock/AbFvOq-007',
    reviewer_name: 'Roy Petersen',
    reviewer_photo_url: null,
    star_rating: 'TWO',
    comment:
      "Had a rough stretch where prints were coming out misaligned on our printer and it took a couple support tickets to sort out the margins. To their credit they did fix it, but the back-and-forth was frustrating for a paid tool.",
    create_time: daysAgo(118),
    update_time: daysAgo(115),
    reply_comment: null,
    reply_update_time: null,
  },
  {
    review_id: 'mock/AbFvOq-008',
    reviewer_name: 'Amina Okafor',
    reviewer_photo_url: null,
    star_rating: 'FOUR',
    comment:
      "Good value for what we pay. The auto-web tier pulls our inventory in nicely and the addendums are always current. Would love a few more layout templates out of the box, but you can build your own.",
    create_time: daysAgo(151),
    update_time: daysAgo(151),
    reply_comment:
      "Appreciate the honest feedback, Amina! More starter templates are on our roadmap — glad the auto-web sync is working well for you.",
    reply_update_time: daysAgo(150),
  },
]

// ── Shared helpers used across UI + API ──────────────────────────────────────
export const STAR_TO_NUM: Record<StarRating, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
}

export function starToNumber(rating: string | null | undefined): number {
  if (!rating) return 0
  return STAR_TO_NUM[rating as StarRating] ?? 0
}
