import { getReviews } from '@/lib/reputation'
import ReviewInbox, { Review } from '@/components/reputation/ReviewInbox'

export const dynamic = 'force-dynamic'

export default async function ReviewsPage() {
  const reviews = await getReviews()
  const initial: Review[] = reviews.map(r => ({
    id: r.id,
    review_id: r.review_id,
    reviewer_name: r.reviewer_name,
    reviewer_photo_url: r.reviewer_photo_url,
    star_rating: r.star_rating,
    comment: r.comment,
    create_time: r.create_time,
    reply_comment: r.reply_comment,
    status: r.status,
    ai_draft: r.ai_draft,
  }))
  return <ReviewInbox initialReviews={initial} />
}
