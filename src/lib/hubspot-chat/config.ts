// HubSpot chat bridge — environment + capability flags.
//
// The bridge is a project-based OAuth app (hubspot-app/) with ONE Custom
// Channel. Each chat surface is a channel ACCOUNT on that channel (homepage =
// HUBSPOT_CHAT_ACCOUNT_HOMEPAGE, in-app Steven = HUBSPOT_CHAT_ACCOUNT_INAPP);
// the webhook names the account, which is how one receiver routes both.
//
// Nothing here may crash a build or a request when unset: an unconfigured
// bridge simply reports not-ready and the hand-off stays on Slack.

export const hubspotChatEnv = {
  clientId:      process.env.HUBSPOT_CHAT_CLIENT_ID        || '',
  clientSecret:  process.env.HUBSPOT_CHAT_CLIENT_SECRET    || '',
  appId:         process.env.HUBSPOT_CHAT_APP_ID           || '',
  developerKey:  process.env.HUBSPOT_DEVELOPER_API_KEY     || '',
  /** Shared secret carried in the webhookUrl query string. HubSpot's docs do
   *  not say whether custom-channel webhooks are signed, so this is the gate
   *  that works either way; a v3 signature, when present, is checked too. */
  webhookToken:  process.env.HUBSPOT_CHAT_WEBHOOK_TOKEN    || '',
  channelId:     process.env.HUBSPOT_CHAT_CHANNEL_ID       || '',
  accountHomepage: process.env.HUBSPOT_CHAT_ACCOUNT_HOMEPAGE || '',
  accountInApp:  process.env.HUBSPOT_CHAT_ACCOUNT_INAPP    || '',
  portalId:      process.env.HUBSPOT_PORTAL_ID             || '23896347',
  /** 'hubspot' turns the bridge on; anything else keeps the Slack hand-off.
   *  The switch is per NEW hand-off — a conversation already live on Slack
   *  finishes on Slack (chat_conversations.handoff_provider). */
  provider:      process.env.CHAT_HANDOFF_PROVIDER         || 'slack',
  siteUrl:       process.env.NEXT_PUBLIC_SITE_URL          || 'https://www.dealeraddendums.com',
}

export const HUBSPOT_API = 'https://api.hubapi.com'
export const CHANNELS_BASE = '/conversations/custom-channels/2026-09'

/** Must match hubspot-app/src/app/app-hsmeta.json requiredScopes exactly —
 *  asking for a scope the app does not declare fails the consent screen. */
export const HUBSPOT_CHAT_SCOPES = [
  'conversations.custom_channels.read',
  'conversations.custom_channels.write',
  'conversations.read',
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'files.read',
  'files.write',
  'oauth',
]

export const oauthConfigured = !!(hubspotChatEnv.clientId && hubspotChatEnv.clientSecret)

export function oauthRedirectUri(): string {
  return `${hubspotChatEnv.siteUrl.replace(/\/$/, '')}/api/hubspot-chat/oauth/callback`
}

/** The webhook URL registered on the channel. */
export function webhookUrl(): string {
  return `${hubspotChatEnv.siteUrl.replace(/\/$/, '')}/api/chat/hubspot-events?token=${encodeURIComponent(hubspotChatEnv.webhookToken)}`
}

/** The bridge is wired (app + channel + website account), whatever the switch. */
export function hubspotBridgeReady(): boolean {
  return oauthConfigured && !!hubspotChatEnv.channelId && !!hubspotChatEnv.accountHomepage
}

/** A hand-off from a page opened with ?hs_bridge_test=1 goes to HubSpot even
 *  while the switch is on Slack — so the bridge can be exercised end to end
 *  without sending real visitors to an inbox nobody is watching yet. */
export function isBridgeTestPage(page: string | null | undefined): boolean {
  return /[?&]hs_bridge_test=1\b/.test(page || '')
}

/** True when a NEW hand-off should go to HubSpot. The OAuth grant itself is
 *  checked at publish time; a dead grant falls back to Slack there. */
export function hubspotHandoffEnabled(): boolean {
  return hubspotChatEnv.provider === 'hubspot'
    && oauthConfigured
    && !!hubspotChatEnv.channelId
    && !!hubspotChatEnv.accountHomepage
}
