import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import React from 'react'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const title = searchParams.get('title') || 'DealerAddendums'
  const type  = searchParams.get('type')  || 'page'

  const typeLabel: Record<string, string> = {
    blog:      'BLOG POST',
    lp:        'DEALER RESOURCES',
    page:      'DEALERADDENDUMS.COM',
    franchise: 'FOR FRANCHISE DEALERS',
    used:      'FOR USED CAR DEALERS',
  }
  const label = typeLabel[type] || 'DEALERADDENDUMS.COM'

  const fontSize = title.length > 60 ? '38px' : title.length > 40 ? '44px' : '50px'

  const el = React.createElement(
    'div',
    {
      style: {
        width: '1200px', height: '630px',
        background: '#2a2b3c',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'sans-serif',
        position: 'relative',
        overflow: 'hidden',
      },
    },
    // Orange bar
    React.createElement('div', {
      style: {
        position: 'absolute', top: 0, left: 0, right: 0, height: '6px',
        background: '#ffa500', display: 'flex',
      },
    }),
    // Main content
    React.createElement(
      'div',
      {
        style: {
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          padding: '64px 80px', justifyContent: 'space-between',
        },
      },
      // Top row: logo + label
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '14px' } },
        React.createElement('div', {
          style: {
            background: '#ffa500', color: '#2a2b3c',
            fontWeight: 700, fontSize: '15px',
            padding: '5px 12px', borderRadius: '4px',
            letterSpacing: '0.08em', display: 'flex',
          },
        }, 'DA'),
        React.createElement('div', {
          style: { fontSize: '16px', fontWeight: 600, color: 'rgba(255,255,255,0.9)', display: 'flex' },
        }, 'DealerAddendums'),
        React.createElement('div', {
          style: {
            marginLeft: '8px', fontSize: '11px', fontWeight: 700,
            color: '#ffa500', letterSpacing: '0.1em',
            border: '1px solid rgba(255,165,0,0.4)',
            padding: '3px 10px', borderRadius: '4px', display: 'flex',
          },
        }, label),
      ),
      // Title
      React.createElement(
        'div',
        { style: { flex: 1, display: 'flex', alignItems: 'center', paddingTop: '24px' } },
        React.createElement('div', {
          style: {
            fontSize, fontWeight: 700,
            color: '#ffffff', lineHeight: 1.2,
            maxWidth: '960px', display: 'flex', flexWrap: 'wrap',
          },
        }, title),
      ),
      // Stats bar
      React.createElement(
        'div',
        {
          style: {
            display: 'flex', gap: '40px', alignItems: 'center',
            borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '24px',
          },
        },
        ...[
          { value: '1,644', label: 'Active Dealers' },
          { value: '2.3M+', label: 'Addendums Printed' },
          { value: 'Since 2014', label: 'In Business' },
        ].map(s =>
          React.createElement(
            'div',
            { key: s.label, style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
            React.createElement('div', {
              style: { fontSize: '20px', fontWeight: 700, color: '#ffffff', display: 'flex' },
            }, s.value),
            React.createElement('div', {
              style: { fontSize: '12px', color: 'rgba(255,255,255,0.5)', display: 'flex' },
            }, s.label),
          )
        ),
        React.createElement('div', {
          style: { marginLeft: 'auto', fontSize: '13px', color: 'rgba(255,255,255,0.4)', display: 'flex' },
        }, 'dealeraddendums.com'),
      ),
    ),
  )

  return new ImageResponse(el, { width: 1200, height: 630 })
}
