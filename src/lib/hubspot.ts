const PORTAL_ID = process.env.HUBSPOT_PORTAL_ID || '23896347'
const BASE_URL = 'https://api.hubapi.com'

interface LeadData {
  email: string
  firstName?: string
  lastName?: string
  company?: string
  phone?: string
  utmSource?: string
  utmCampaign?: string
  utmTerm?: string
  dealerType?: string
  abVariant?: string
  headlineSeen?: string
}

export async function createOrUpdateHubSpotContact(lead: LeadData): Promise<string | null> {
  const apiKey = process.env.HUBSPOT_API_KEY
  if (!apiKey) return null

  const properties: Record<string, string> = {
    email: lead.email,
    ...(lead.firstName && { firstname: lead.firstName }),
    ...(lead.lastName && { lastname: lead.lastName }),
    ...(lead.company && { company: lead.company }),
    ...(lead.phone && { phone: lead.phone }),
    ...(lead.utmSource && { hs_analytics_source: lead.utmSource }),
    ...(lead.utmCampaign && { hs_analytics_last_referrer: lead.utmCampaign }),
    lead_source: 'Marketing Site',
    lifecyclestage: 'lead',
  }

  try {
    const res = await fetch(`${BASE_URL}/crm/v3/objects/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ properties }),
    })

    if (res.status === 409) {
      const existing = await res.json()
      return existing?.message?.match(/ID: (\d+)/)?.[1] || null
    }

    const data = await res.json()
    return data.id || null
  } catch {
    return null
  }
}
