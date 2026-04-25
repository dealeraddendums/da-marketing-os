// PostHog server-side event tracking

export async function trackServerEvent(
  event: string,
  properties: Record<string, unknown> = {},
  distinctId = 'server'
): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com'
  if (!key) return

  await fetch(`${host}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      event,
      distinct_id: distinctId,
      properties: {
        ...properties,
        $lib: 'da-marketing-os',
      },
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {})
}
