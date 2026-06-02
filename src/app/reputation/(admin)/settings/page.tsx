import { supabase } from '@/lib/supabase'
import { getReputationSettings } from '@/lib/reputation'
import { GBP_CONNECTED } from '@/lib/gbp'
import SettingsForm from '@/components/reputation/SettingsForm'

export const dynamic = 'force-dynamic'

export default async function ReputationSettingsPage() {
  const { review_page_url } = await getReputationSettings()

  // Last sync ≈ most recent updated_at across cached reviews.
  const { data: latest } = await supabase
    .from('gbp_reviews')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <SettingsForm
      initialUrl={review_page_url || ''}
      gbpConnected={GBP_CONNECTED}
      lastSync={latest?.updated_at ?? null}
    />
  )
}
