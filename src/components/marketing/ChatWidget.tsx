'use client'
import { useEffect, useRef, useState } from 'react'
import { getAttribution } from '@/lib/attribution'

// `kind` distinguishes incoming left-aligned bubbles: bot (Steven), agent (a
// real teammate replying from the HubSpot inbox or Slack), or system (notes).
interface ChatFile { name: string; mime?: string; url?: string }
interface Msg {
  role: 'user' | 'assistant'; content: string; kind?: 'bot' | 'agent' | 'system'
  sender?: string | null; files?: ChatFile[]
  /** The agent's staff headshot (takeover header) — public URL or null. */
  photo?: string | null
}

const NAVY = '#2a2b3c'
const ORANGE = '#ffa500'
const BLUE = '#1976d2'
const PHONE = '(801) 415-9435'

/** A person's circular photo, or their initials (white on the navy header) —
 *  never a broken image. Same look as da-platform's components/Avatar.tsx. */
function Avatar({ url, name, size = 28 }: { url: string | null; name?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" onError={() => setBroken(true)} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', flexShrink: 0, border: '1px solid #fff' }} />
  }
  const p = (name ?? '').trim().split(/\s+/).filter(Boolean)
  const ini = ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
  return <div style={{ width: size, height: size, borderRadius: '50%', background: '#fff', color: NAVY, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 600 }}>{ini}</div>
}

const GREETING =
  "Hi! I'm Steven, the DealerAddendums assistant — ask me anything about addendums, pricing, FTC Buyers Guides, or how the trial works. Prefer a person? There's a “Talk to a person” link just below the box."

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
  const [liveAgent, setLiveAgent] = useState<{ name: string | null; photo: string | null } | null>(null)
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
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

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
        if (data.agent) setLiveAgent(data.agent as { name: string | null; photo: string | null })
        if (data.at) {
          afterRef.current = data.at
          try { sessionStorage.setItem('da_chat_after', data.at) } catch { /* */ }
        }
        const incoming: { id: string; role: string; body: string; sender?: string | null; senderPhoto?: string | null; attachments?: ChatFile[] }[] = data.messages || []
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
            sender: m.sender || null,
            photo: m.senderPhoto || null,
            files: m.attachments || [],
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
      // The server answered "a person has this now" instead of streaming Steven:
      // a typed hand-off just went live, or this chat was already live.
      const liveCid = res.headers.get('x-chat-conversation')
      if (res.headers.get('x-chat-live') === '1' && liveCid) {
        setMessages(cur => cur.slice(0, -1)) // drop the empty bot placeholder
        setEscalated(true)
        try { sessionStorage.setItem('da_chat_escalated', '1') } catch { /* */ }
        if (!live) goLive(liveCid, res.headers.get('x-chat-at') || undefined)
        return
      }
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

  // ── Live mode: send a file to the agent ───────────────────────────────────
  const sendFile = async (file: File) => {
    if (!live || !conversationId || uploading) return
    if (file.size > 10 * 1024 * 1024) {
      setMessages(cur => [...cur, { role: 'assistant', kind: 'system', content: `${file.name} is too large — files can be up to 10 MB.` }])
      return
    }
    setUploading(true)
    setMessages(cur => [...cur, { role: 'user', content: '', files: [{ name: file.name, mime: file.type }] }])
    try {
      const form = new FormData()
      form.append('conversationId', conversationId)
      form.append('file', file)
      const res = await fetch('/api/chat/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setMessages(cur => [...cur, {
          role: 'assistant', kind: 'system',
          content: data?.error || `Couldn’t send ${file.name} — please try again.`,
        }])
      }
    } catch {
      setMessages(cur => [...cur, { role: 'assistant', kind: 'system', content: `Couldn’t send ${file.name} — please try again.` }])
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
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
          page: typeof location !== 'undefined' ? location.pathname + location.search : null,
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

  // Once a team member has replied, the header is theirs for the rest of the chat.
  const lastAgentMsg = [...messages].reverse().find(m => m.kind === 'agent' && m.sender) ?? null
  // The poll's current view of the agent wins (fresh photo); else the last reply we saw.
  const agent = lastAgentMsg
    ? { sender: lastAgentMsg.sender, photo: (liveAgent && liveAgent.name === lastAgentMsg.sender ? liveAgent.photo : null) ?? lastAgentMsg.photo ?? null }
    : null
  const canSend = !sending && !!input.trim()

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {agent ? (
                <Avatar url={agent.photo ?? null} name={agent.sender} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/icon.png" alt="DealerAddendums" width={28} height={28} style={{ borderRadius: '50%', display: 'block', flexShrink: 0 }} />
              )}
              <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{agent ? agent.sender : 'Steven'}</span>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>DealerAddendums support</span>
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
                    <span style={{ fontSize: 11, fontWeight: 600, color: NAVY, margin: '0 0 2px 4px' }}>{m.sender || 'DA Team'}</span>
                  )}
                  <div style={{
                    maxWidth: '82%', padding: '9px 12px', borderRadius: 10, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                    background: isUser ? BLUE : '#fff',
                    color: isUser ? '#fff' : '#333',
                    border: isUser ? 'none' : `1px solid ${isAgent ? NAVY : '#e0e0e0'}`,
                  }}>
                    {m.content || (m.files?.length ? null : (sending && i === messages.length - 1 ? '…' : ''))}
                    {m.files?.map((f, j) => (
                      <div key={j} style={{ marginTop: m.content || j ? 6 : 0 }}>
                        {f.url ? (
                          <a href={f.url} target="_blank" rel="noopener noreferrer"
                            style={{ color: isUser ? '#fff' : BLUE, textDecoration: 'underline', wordBreak: 'break-all' }}>
                            📎 {f.name}
                          </a>
                        ) : (
                          <span style={{ wordBreak: 'break-all' }}>📎 {f.name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Live banner (status only — the "talk to a person" link sits under the composer) */}
          {live && (
            <div style={{ padding: '8px 14px 0', background: '#fff' }}>
              <div style={{
                width: '100%', minHeight: 34, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                border: '1px solid #cfe8d2', background: '#f1faf2', color: '#2e7d32', fontSize: 13, fontWeight: 600, padding: '6px 10px',
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4caf50', display: 'inline-block' }} />
                You're connected to our team
              </div>
            </div>
          )}

          {/* Composer */}
          <div style={{ display: 'flex', gap: 8, padding: '14px 14px 6px', background: '#fff', alignItems: 'flex-end' }}>
            {live && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) void sendFile(f) }}
                />
                <button
                  aria-label="Attach a file"
                  title="Attach a file"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  style={{
                    height: 38, width: 38, flexShrink: 0, borderRadius: 6, border: '1px solid #cccccc',
                    background: '#fff', color: NAVY, fontSize: 17, cursor: uploading ? 'default' : 'pointer',
                    opacity: uploading ? 0.5 : 1,
                  }}
                >
                  📎
                </button>
              </>
            )}
            <textarea
              ref={inputRef}
              aria-label="Type your message"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
              placeholder={live ? 'Message our team…' : 'Ask about addendums, pricing…'}
              rows={1}
              onFocus={e => { e.currentTarget.style.borderColor = BLUE }}
              onBlur={e => { e.currentTarget.style.borderColor = '#78828c' }}
              style={{
                flex: 1, resize: 'none', maxHeight: 96, padding: '10px 12px', fontSize: 14,
                fontFamily: "'Roboto', sans-serif", color: NAVY, background: '#fff', border: '1px solid #78828c',
                borderRadius: 6, outline: 'none', boxSizing: 'border-box',
              }}
            />
            <button
              aria-label="Send message"
              onClick={() => void send()}
              disabled={!canSend}
              style={{
                height: 40, padding: '0 16px', borderRadius: 6, border: 'none',
                background: BLUE, opacity: canSend ? 1 : 0.55, color: '#fff',
                fontSize: 14, fontWeight: 600, cursor: sending ? 'wait' : canSend ? 'pointer' : 'default',
                fontFamily: "'Roboto', sans-serif",
              }}
            >
              Send
            </button>
          </div>
          {/* Secondary: a person is the fallback, not the first thing to reach for. */}
          {!live && (
            <div style={{ padding: '0 14px 12px', background: '#fff' }}>
              {escalated ? (
                <span style={{ color: '#78828c', fontSize: 12 }}>✓ Team notified — we’ll reach out</span>
              ) : (
                <button onClick={escalate} disabled={escalating}
                  style={{ background: 'none', border: 'none', padding: 0, color: BLUE, fontSize: 12, cursor: escalating ? 'default' : 'pointer', fontFamily: "'Roboto', sans-serif", textDecoration: 'underline' }}>
                  {escalating ? 'Notifying our team…' : 'Talk to a person'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
