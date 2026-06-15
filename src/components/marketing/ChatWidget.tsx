'use client'
import { useEffect, useRef, useState } from 'react'
import { getAttribution } from '@/lib/attribution'

// `kind` distinguishes incoming left-aligned bubbles: bot (AI), agent (a real
// teammate replying from the Slack thread), or system (status notes).
interface Msg { role: 'user' | 'assistant'; content: string; kind?: 'bot' | 'agent' | 'system' }

const NAVY = '#2a2b3c'
const ORANGE = '#ffa500'
const BLUE = '#1976d2'
const PHONE = '(801) 415-9435'

const GREETING =
  "Hi! I'm the DealerAddendums assistant — ask me anything about addendums, pricing, FTC Buyers Guides, or how the trial works. Prefer a person? Tap “Talk to a human” below."

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem('da_chat_session')
    if (!id) {
      id = (crypto.randomUUID?.() || `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      sessionStorage.setItem('da_chat_session', id)
    }
    return id
  } catch {
    return `sess-${Date.now()}`
  }
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [escalated, setEscalated] = useState(false)
  const [escalating, setEscalating] = useState(false)
  const [live, setLive] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const sessionId = useRef<string>('')
  const afterRef = useRef<string>('1970-01-01T00:00:00.000Z') // poll cursor
  const seenRef = useRef<Set<string>>(new Set())               // dedupe polled ids
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    sessionId.current = getSessionId()
    try {
      if (sessionStorage.getItem('da_chat_escalated') === '1') setEscalated(true)
      // Restore a live session across reloads so polling resumes.
      if (sessionStorage.getItem('da_chat_live') === '1') {
        const cid = sessionStorage.getItem('da_chat_convo')
        if (cid) {
          setConversationId(cid)
          afterRef.current = sessionStorage.getItem('da_chat_after') || new Date().toISOString()
          setLive(true)
        }
      }
    } catch { /* */ }
  }, [])

  // Seed the greeting the first time the panel opens.
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: 'assistant', content: GREETING, kind: 'bot' }])
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // ── Live polling: pull new agent/system messages every ~3s while live ─────
  useEffect(() => {
    if (!live || !conversationId) return
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/chat/poll?conversation=${encodeURIComponent(conversationId)}&after=${encodeURIComponent(afterRef.current)}`,
        )
        const data = await res.json().catch(() => null)
        if (cancelled || !data) return
        if (data.at) {
          afterRef.current = data.at
          try { sessionStorage.setItem('da_chat_after', data.at) } catch { /* */ }
        }
        const incoming: { id: string; role: string; body: string }[] = data.messages || []
        if (!incoming.length) return
        const fresh = incoming.filter(m => !seenRef.current.has(m.id))
        fresh.forEach(m => seenRef.current.add(m.id))
        if (!fresh.length) return
        setMessages(cur => [
          ...cur,
          ...fresh.map(m => ({
            role: 'assistant' as const,
            content: m.body,
            kind: (m.role === 'system' ? 'system' : 'agent') as Msg['kind'],
          })),
        ])
      } catch { /* keep polling */ }
    }
    void tick()
    const iv = setInterval(tick, 3000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [live, conversationId])

  const goLive = (cid: string, at?: string) => {
    setConversationId(cid)
    afterRef.current = at || new Date().toISOString()
    setLive(true)
    try {
      sessionStorage.setItem('da_chat_live', '1')
      sessionStorage.setItem('da_chat_convo', cid)
      sessionStorage.setItem('da_chat_after', afterRef.current)
    } catch { /* */ }
    setMessages(cur => [...cur, {
      role: 'assistant', kind: 'system',
      content: "You're connected to our team — someone will reply right here. Keep typing below.",
    }])
  }

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return

    // ── Live mode: route to the agent (Slack thread), not the bot ───────────
    if (live && conversationId) {
      setMessages(cur => [...cur, { role: 'user', content: text }])
      setInput('')
      setSending(true)
      try {
        await fetch('/api/chat/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, body: text }),
        })
      } catch { /* message is shown locally; relay is best-effort */ } finally {
        setSending(false)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
      return
    }

    // ── Bot mode: stream from /api/chat ──────────────────────────────────────
    const attribution = getAttribution()
    const next: Msg[] = [...messages, { role: 'user', content: text }]
    setMessages([...next, { role: 'assistant', content: '', kind: 'bot' }]) // placeholder for the stream
    setInput('')
    setSending(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
          sessionId: sessionId.current,
          utmTerm: attribution.utm_term || null,
          attribution,
        }),
      })
      if (!res.body) throw new Error('no stream')
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = dec.decode(value, { stream: true })
        setMessages(cur => {
          const copy = cur.slice()
          copy[copy.length - 1] = { role: 'assistant', kind: 'bot', content: copy[copy.length - 1].content + chunk }
          return copy
        })
      }
    } catch {
      setMessages(cur => {
        const copy = cur.slice()
        const last = copy[copy.length - 1]
        if (last?.role === 'assistant' && !last.content) {
          copy[copy.length - 1] = { role: 'assistant', kind: 'bot', content: `Sorry, I hit a snag. Please try again, or call us at ${PHONE}.` }
        }
        return copy
      })
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const escalate = async () => {
    if (escalated || escalating || live) return
    setEscalating(true)
    const attribution = getAttribution()
    const email = messages.map(m => m.content).join(' ').match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)?.[0] || null
    try {
      const res = await fetch('/api/chat/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId.current,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          email,
          page: typeof location !== 'undefined' ? location.pathname : null,
          utm: { utm_source: attribution.utm_source, utm_campaign: attribution.utm_campaign, utm_term: attribution.utm_term },
        }),
      })
      const data = await res.json().catch(() => null)
      setEscalated(true)
      try { sessionStorage.setItem('da_chat_escalated', '1') } catch { /* */ }
      if (data?.conversationId && data?.live) {
        // Two-way live mode engaged — the team replies in Slack, visitor here.
        goLive(data.conversationId, data.at)
      } else {
        // Notify-only fallback (no bot token / Slack down) — legacy message.
        setMessages(cur => [...cur, {
          role: 'assistant', kind: 'system',
          content: `Our team's been notified — someone will reach out shortly. For immediate help, call ${PHONE}.`,
        }])
      }
    } catch {
      setEscalated(true)
      setMessages(cur => [...cur, {
        role: 'assistant', kind: 'system',
        content: `Our team's been notified — someone will reach out shortly. For immediate help, call ${PHONE}.`,
      }])
    } finally {
      setEscalating(false)
    }
  }

  return (
    <>
      {/* Launcher bubble */}
      {!open && (
        <button
          aria-label="Open chat"
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 9998,
            width: 56, height: 56, borderRadius: '50%', border: 'none',
            background: NAVY, color: ORANGE, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,0,0,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Roboto', sans-serif",
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-4 4V5a1 1 0 0 1 1-1Z" fill={ORANGE} />
          </svg>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className="da-chat-panel"
          role="dialog"
          aria-modal="true"
          aria-label="DealerAddendums chat"
          style={{
            position: 'fixed', zIndex: 9999, background: '#fff',
            border: '1px solid #e0e0e0', borderRadius: 10, overflow: 'hidden',
            boxShadow: '0 12px 40px rgba(0,0,0,0.30)',
            display: 'flex', flexDirection: 'column',
            fontFamily: "'Roboto', sans-serif",
          }}
        >
          {/* Header */}
          <div style={{ background: NAVY, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: ORANGE, color: NAVY, fontWeight: 700, fontSize: 11, padding: '3px 7px', borderRadius: 4, letterSpacing: '0.06em' }}>DA</span>
              <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>DealerAddendums</span>
              {live && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 4, color: '#aee9b8', fontSize: 12, fontWeight: 600 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4caf50', display: 'inline-block' }} />
                  Live
                </span>
              )}
            </div>
            <button aria-label="Close chat" onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: 4 }}>×</button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, background: '#f5f6f7', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => {
              if (m.kind === 'system') {
                return (
                  <div key={i} style={{ textAlign: 'center', color: '#78828c', fontSize: 12, lineHeight: 1.4, padding: '2px 8px' }}>
                    {m.content}
                  </div>
                )
              }
              const isUser = m.role === 'user'
              const isAgent = m.kind === 'agent'
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                  {isAgent && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: NAVY, margin: '0 0 2px 4px' }}>DA Team</span>
                  )}
                  <div style={{
                    maxWidth: '82%', padding: '9px 12px', borderRadius: 10, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                    background: isUser ? BLUE : '#fff',
                    color: isUser ? '#fff' : '#333',
                    border: isUser ? 'none' : `1px solid ${isAgent ? NAVY : '#e0e0e0'}`,
                  }}>
                    {m.content || (sending && i === messages.length - 1 ? '…' : '')}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Talk to a human / live banner */}
          <div style={{ padding: '8px 14px 0', background: '#fff' }}>
            {live ? (
              <div style={{
                width: '100%', minHeight: 34, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                border: '1px solid #cfe8d2', background: '#f1faf2', color: '#2e7d32', fontSize: 13, fontWeight: 600, padding: '6px 10px',
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4caf50', display: 'inline-block' }} />
                You're connected to our team
              </div>
            ) : (
              <button
                onClick={escalate}
                disabled={escalated || escalating}
                style={{
                  width: '100%', height: 34, borderRadius: 6, cursor: escalated ? 'default' : 'pointer',
                  border: `1px solid ${escalated ? '#cfd8dc' : ORANGE}`,
                  background: escalated ? '#f5f6f7' : '#fff7ec',
                  color: escalated ? '#78828c' : '#b06a00', fontSize: 13, fontWeight: 600,
                  fontFamily: "'Roboto', sans-serif",
                }}
              >
                {escalated ? '✓ Team notified — we’ll reach out' : escalating ? 'Notifying our team…' : '🙋 Talk to a human'}
              </button>
            )}
          </div>

          {/* Composer */}
          <div style={{ display: 'flex', gap: 8, padding: 14, background: '#fff', alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              aria-label="Type your message"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
              placeholder={live ? 'Message our team…' : 'Ask about addendums, pricing…'}
              rows={1}
              style={{
                flex: 1, resize: 'none', maxHeight: 96, padding: '9px 11px', fontSize: 14,
                fontFamily: "'Roboto', sans-serif", color: '#333', border: '1px solid #cccccc',
                borderRadius: 6, outline: 'none', boxSizing: 'border-box',
              }}
            />
            <button
              aria-label="Send message"
              onClick={() => void send()}
              disabled={sending || !input.trim()}
              style={{
                height: 38, padding: '0 16px', borderRadius: 6, border: 'none',
                background: sending || !input.trim() ? '#9bbfe6' : BLUE, color: '#fff',
                fontSize: 14, fontWeight: 600, cursor: sending || !input.trim() ? 'default' : 'pointer',
                fontFamily: "'Roboto', sans-serif",
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  )
}
