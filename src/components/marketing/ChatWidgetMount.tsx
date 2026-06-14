'use client'
import dynamic from 'next/dynamic'

// Lazy/client-only so the widget JS isn't in the initial bundle and never SSRs
// (it's a floating overlay with no SEO/first-paint value).
const ChatWidget = dynamic(() => import('./ChatWidget'), { ssr: false })

export default function ChatWidgetMount() {
  return <ChatWidget />
}
