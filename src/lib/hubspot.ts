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

// Chat sales-lead → HubSpot Contact (CONTACT only — chat never creates a
// Company/dealer). Dedupe by email. No-backward + no-clobber guard mirroring
// the Phase-14 sync: an existing contact only gets BLANK fields filled and a
// timeline note — its lifecyclestage is never sent (so a converted dealer's
// contact can't drop back to 'lead'), and fields Phase-14 owns are left alone.
// Fire-and-forget from the caller. Returns whether a contact was reached.
export async function upsertChatContact(input: {
  email: string
  name?: string | null
  company?: string | null
  phone?: string | null
  utmSource?: string | null
  utmCampaign?: string | null
  utmTerm?: string | null
  referrer?: string | null
  enrichment?: string | null
}): Promise<{ ok: boolean; contactId?: string; created?: boolean }> {
  const apiKey = process.env.HUBSPOT_API_KEY
  if (!apiKey) return { ok: false }
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }
  const email = input.email.toLowerCase()
  const firstName = input.name?.trim().split(/\s+/)[0]

  try {
    // 1. Dedupe by email.
    const sres = await fetch(`${BASE_URL}/crm/v3/objects/contacts/search`, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
        properties: ['email', 'firstname', 'company', 'phone', 'lifecyclestage', 'lead_source'],
        limit: 1,
      }),
    })
    const found = (await sres.json())?.results?.[0]

    let contactId: string | undefined
    let created = false

    if (found) {
      // Existing — fill only blank core fields; NEVER touch lifecyclestage.
      contactId = found.id
      const p = found.properties || {}
      const patch: Record<string, string> = {}
      if (!p.firstname && firstName) patch.firstname = firstName
      if (!p.company && input.company) patch.company = input.company
      if (!p.phone && input.phone) patch.phone = input.phone
      if (!p.lead_source) patch.lead_source = 'Marketing Site — Chat'
      if (Object.keys(patch).length) {
        await fetch(`${BASE_URL}/crm/v3/objects/contacts/${contactId}`, {
          method: 'PATCH', headers: H, body: JSON.stringify({ properties: patch }),
        })
      }
    } else {
      // New — set lifecyclestage 'lead' on create only.
      const props: Record<string, string> = {
        email,
        ...(firstName && { firstname: firstName }),
        ...(input.company && { company: input.company }),
        ...(input.phone && { phone: input.phone }),
        lead_source: 'Marketing Site — Chat',
        lifecyclestage: 'lead',
      }
      const cres = await fetch(`${BASE_URL}/crm/v3/objects/contacts`, {
        method: 'POST', headers: H, body: JSON.stringify({ properties: props }),
      })
      if (cres.status === 409) {
        contactId = (await cres.json())?.message?.match(/ID: (\d+)/)?.[1] // race: created between search+create
      } else if (cres.ok) {
        contactId = (await cres.json())?.id; created = true
      } else {
        return { ok: false }
      }
    }

    // 2. Timeline note with the chat context — never clobbers contact fields.
    if (contactId) {
      const attribution = [
        input.utmSource && `source=${input.utmSource}`,
        input.utmCampaign && `campaign=${input.utmCampaign}`,
        input.utmTerm && `term=${input.utmTerm}`,
        input.referrer && `referrer=${input.referrer}`,
      ].filter(Boolean).join(' · ')
      const body = [
        `Chatted via website on ${new Date().toISOString().slice(0, 10)}.`,
        'Lead source: website chat (sales lead — not a trial signup).',
        input.enrichment ? `AI enrichment: ${input.enrichment}.` : '',
        attribution ? `Attribution: ${attribution}.` : '',
      ].filter(Boolean).join(' ')
      try {
        const nres = await fetch(`${BASE_URL}/crm/v3/objects/notes`, {
          method: 'POST', headers: H,
          body: JSON.stringify({ properties: { hs_note_body: body, hs_timestamp: Date.now() } }),
        })
        if (nres.ok) {
          const noteId = (await nres.json())?.id
          if (noteId) {
            await fetch(`${BASE_URL}/crm/v4/objects/notes/${noteId}/associations/default/contacts/${contactId}`, {
              method: 'PUT', headers: H,
            })
          }
        }
      } catch { /* note is best-effort */ }
    }

    return { ok: !!contactId, contactId, created }
  } catch {
    return { ok: false }
  }
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
