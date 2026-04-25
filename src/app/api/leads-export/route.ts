import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { data: leads, error } = await supabase
    .from('marketing_leads')
    .select('id, name, email, dealership, phone, source, status, created_at, ai_enrichment')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }

  const header = ['ID', 'Name', 'Email', 'Dealership', 'Phone', 'Source', 'Status', 'Created At', 'AI Size', 'AI Type', 'AI Priority']
  const rows = (leads || []).map(l => {
    const ai = l.ai_enrichment as Record<string, string> | null
    return [
      l.id,
      l.name,
      l.email,
      l.dealership,
      l.phone || '',
      l.source || '',
      l.status || '',
      l.created_at ? new Date(l.created_at).toLocaleDateString('en-US') : '',
      ai?.estimatedSize || '',
      ai?.likelyType || '',
      ai?.priority || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`)
  })

  const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="da-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
