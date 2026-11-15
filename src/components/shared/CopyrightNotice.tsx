import type { CSSProperties } from 'react'

// The © line shared by every footer. The year is computed at render so it can
// never go stale (it was hardcoded "© 2025" in four separate footers).
export function copyrightText(): string {
  return `© 2014–${new Date().getFullYear()} DealerAddendums. All rights reserved.`
}

export default function CopyrightNotice({
  as: Tag = 'p',
  style,
  className,
}: {
  as?: 'p' | 'span'
  style?: CSSProperties
  className?: string
}) {
  return <Tag style={style} className={className}>{copyrightText()}</Tag>
}
