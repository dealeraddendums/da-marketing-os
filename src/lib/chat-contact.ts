import { createMessage, parseJSON } from '@/lib/ai'

// Pull name / dealership / phone out of a chat transcript. Shared by lead
// capture (/api/chat) and the human hand-off (escalate), so the agent in the
// inbox sees who they are talking to — the widget only knows what was typed.

export interface ExtractedContact {
  name: string | null
  dealership: string | null
  phone: string | null
}

const EMPTY: ExtractedContact = { name: null, dealership: null, phone: null }

export async function extractContact(
  messages: { role: string; content: string }[],
): Promise<ExtractedContact> {
  const transcript = messages.map(m => `${m.role}: ${m.content}`).join('\n').slice(0, 6000)
  if (!transcript.trim()) return EMPTY
  try {
    const text = await createMessage({
      model: 'claude-haiku-4-5',
      maxTokens: 200,
      system: 'Extract the contact details from this car-dealer sales chat. Respond ONLY with JSON, no markdown: {"name":"","dealership":"","phone":""}. Use an empty string for any field not clearly present.',
      messages: [{ role: 'user', content: transcript }],
    })
    const parsed = parseJSON<{ name?: string; dealership?: string; phone?: string }>(text)
    return {
      name: parsed?.name?.trim() || null,
      dealership: parsed?.dealership?.trim() || null,
      phone: parsed?.phone?.trim() || null,
    }
  } catch {
    // Best-effort: a hand-off or lead must never fail over enrichment.
    return EMPTY
  }
}
