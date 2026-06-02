import { supabase } from '@/lib/supabase'
import RequestsManager, { CampaignRow, RequestRow } from '@/components/reputation/RequestsManager'

export const dynamic = 'force-dynamic'

export default async function RequestsPage() {
  const { data: campaigns } = await supabase
    .from('review_campaigns')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: requests } = await supabase
    .from('review_requests')
    .select('id, campaign_id, dealer_name, contact_email, status, sent_at')
    .order('created_at', { ascending: false })

  const requestsByCampaign: Record<string, RequestRow[]> = {}
  for (const r of (requests || []) as RequestRow[]) {
    if (!r.campaign_id) continue
    ;(requestsByCampaign[r.campaign_id] ||= []).push(r)
  }

  return (
    <RequestsManager
      campaigns={(campaigns || []) as CampaignRow[]}
      requestsByCampaign={requestsByCampaign}
    />
  )
}
