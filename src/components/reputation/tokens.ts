// DA design tokens for the Reputation module.
//
// Deliberately NOT a 'use client' module. These are plain values, and both
// Server and Client Components need them: `src/app/reputation/(admin)/page.tsx`
// is a Server Component, and when a server component imports from a
// 'use client' module it receives a client module *reference*, not the value —
// so `C.orange` became an unresolvable reference and the page 500'd with
// "Could not find the module .../ui.tsx#C#orange in the React Client Manifest".
// Keeping the tokens here lets both sides import the same real object.
export const C = {
  navy: '#2a2b3c',
  orange: '#ffa500',
  blue: '#1976d2',
  blueLight: '#2196f3',
  success: '#4caf50',
  error: '#ff5252',
  warning: '#ff9800',
  bgApp: '#3a6897',
  bgSurface: '#ffffff',
  bgSubtle: '#f5f6f7',
  textPrimary: '#333333',
  textSecondary: '#55595c',
  textMuted: '#78828c',
  border: '#e0e0e0',
  borderStrong: '#c0c0c0',
} as const
