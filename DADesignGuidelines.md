# DealerAddendums Design Guidelines
## DADesignGuidelines.md
### Last updated: 2026-04-24

---

## Purpose

This document is the single source of truth for all UI work at DealerAddendums.
Whether you are building a new page, a modal, a form, or a small component —
everything must follow these guidelines. When working with Claude, paste this
document or reference it in your CLAUDE.md so every output is consistent.

---

## Brand identity

DealerAddendums is a professional B2B SaaS platform used daily by franchise car
dealerships across the US. The UI must feel:

- **Familiar** — dealers who use the legacy app should feel at home immediately
- **Professional** — this is a business tool, not a consumer app
- **Fast** — dense information layouts, not spacious marketing pages
- **Trustworthy** — clean, consistent, no surprises

The aesthetic is modern flat design. No gradients. No shadows on cards.
No decorative elements. Every pixel earns its place.

---

## Color palette

These are exact values taken from the live production app. Do not deviate.

```css
/* Core */
--navy:           #2a2b3c;   /* topbar, sidebar background */
--orange:         #ffa500;   /* primary nav accent, active states, sub-nav */
--blue:           #1976d2;   /* primary action buttons */
--blue-light:     #2196f3;   /* secondary blue, hover states, info badges */

/* Feedback */
--success:        #4caf50;   /* success states, LOG IN button, printed status */
--error:          #ff5252;   /* errors, destructive actions, delete buttons */
--warning:        #ff9800;   /* warnings, at-risk indicators */

/* Backgrounds */
--bg-app:         #3a6897;   /* main page background */
--bg-surface:     #ffffff;   /* cards, panels, modals, table rows */
--bg-subtle:      #f5f6f7;   /* alternating table rows, input backgrounds */

/* Text */
--text-primary:   #333333;   /* body text, labels */
--text-secondary: #55595c;   /* secondary text, subtitles */
--text-muted:     #78828c;   /* placeholder text, helper text, timestamps */
--text-inverse:   #ffffff;   /* text on dark backgrounds */

/* Borders */
--border:         #e0e0e0;   /* standard borders, input borders */
--border-strong:  #c0c0c0;   /* emphasized borders, dividers */
```

### Color usage rules

- **Never** use colors outside this palette without explicit approval
- **Never** use gradients anywhere in the application UI
- **Never** use opacity variants of brand colors — use the defined values
- The orange (`#ffa500`) is for navigation only — not for arbitrary highlights
- The blue (`#1976d2`) is for primary actions — one primary action per view
- Red (`#ff5252`) is for destructive actions only — delete, remove, error states

---

## Typography

### Font stack
```css
font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;
```

Import Roboto from Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Type scale
| Size | Use |
|---|---|
| 32px / weight 600 | Page titles (h1) |
| 24px / weight 600 | Section headings (h2) |
| 18px / weight 600 | Card headings, modal titles |
| 16px / weight 500 | Sub-headings, emphasized labels |
| 14px / weight 400 | Body text, table content (base size) |
| 12px / weight 500 | Table headers (uppercase), badges, helper text |
| 11px / weight 700 | Badge labels |
| 9–10px / weight 400 | Fine print, PDF footnotes |

### Text rules
- Base font size: **14px**, line-height: **1.5**
- Table column headers: **12px, uppercase, weight 500, color --text-muted**
- Never use font sizes below 9px in UI (PDF rendering is different)
- Never use font weights outside 400/500/600/700


---

## Components

### Buttons

```
Primary:    bg #1976d2  white text   radius 4px   height 36px   padding 0 16px
Success:    bg #4caf50  white text   radius 4px   height 36px   (LOG IN, Save, Confirm)
Danger:     bg #ff5252  white text   radius 4px   height 36px   (Delete, Remove)
Orange:     bg #ffa500  #333 text    radius 4px   height 36px   (active nav style)
Secondary:  bg white    #333 text    radius 4px   height 36px   border 1px #e0e0e0
```

**Button rules:**
- One primary button per view/modal — the most important action
- Destructive buttons (delete/remove) must require confirmation before executing
- Disabled state: opacity 0.5, cursor not-allowed
- Loading state: show spinner inside button, keep button width stable
- Small buttons (compact tables): height 28px, padding 0 10px, font-size 12px
- Never use icon-only buttons without a tooltip

### Inputs and forms

```css
input, select, textarea {
  height: 36px;          /* inputs and selects */
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 0 12px;
  font-size: 14px;
  font-family: Roboto, sans-serif;
  color: #333333;
  background: #ffffff;
}
input:focus, select:focus, textarea:focus {
  border-color: #1976d2;
  outline: none;
  box-shadow: none;       /* NO box shadows */
}
textarea {
  height: auto;           /* let it be set by rows attribute */
  padding: 8px 12px;
}
```

**Form layout:**
- Two-column label + input layout for forms (label left, input right)
- Labels: 14px, weight 500, color --text-secondary
- Required fields: append `*` to label
- Helper text: 12px, color --text-muted, below the input
- Error text: 12px, color --error, below the input
- Form sections separated by a horizontal rule or 24px gap

### Cards and panels

```css
.card {
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 24px;
  /* NO box-shadow */
}
```

**Card rules:**
- Never add box-shadow to cards (modals are the only exception)
- Border-radius maximum 6px for cards (20px is OK for pill badges only)
- Card header: 16px weight 600, border-bottom 1px #e0e0e0, padding-bottom 12px

### Tables

```
Header row:   background #f5f6f7   font 12px uppercase weight 500   color --text-muted
Data rows:    background white     border-bottom 1px #e0e0e0
Hover state:  background #f5f6f7
Selected row: background #e3f2fd   border-left 3px solid #1976d2
```

**Table rules:**
- Always show column headers, even for simple tables
- Sortable columns: show sort indicator (↑↓), active sort highlighted
- Pagination: rows-per-page selector (10/25/50), prev/next buttons, "X–Y of Z" count
- Empty state: centered message explaining why the table is empty + action button if applicable
- Action buttons in tables: small height (28px), right-aligned in last column
- Checkboxes for bulk selection: leftmost column, header checkbox selects/deselects all

### Badges and status indicators

```
Success badge:   bg #e8f5e9   text #2e7d32   (Active, Printed, Current)
Error badge:     bg #ffebee   text #c62828   (Inactive, Error, Overdue)
Info badge:      bg #e3f2fd   text #1565c0   (New, Info, Group)
Warning badge:   bg #fff3e0   text #e65100   (At Risk, Warning, Pending)
Neutral badge:   bg #f5f6f7   text #55595c   (Manual, Draft, Unknown)
```

All badges: border-radius 20px, font-size 11px, font-weight 700, padding 2px 8px

### Modals and dialogs

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  position: fixed;
  inset: 0;
  z-index: 1000;
}
.modal {
  background: #ffffff;
  border-radius: 6px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);  /* ONLY place box-shadow is allowed */
  max-width: 600px;
  width: 90%;
  padding: 24px;
}
```

**Modal rules:**
- Title: 18px weight 600
- Close button: top-right corner, × character or icon
- Footer: right-aligned buttons, Cancel (secondary) + primary action
- Confirmation dialogs: always require explicit user action — no auto-dismissal
- Never stack modals — close the current one before opening another

### Navigation

**Sidebar nav item:**
```css
/* Default */
.nav-item {
  padding: 10px 16px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
}
/* Active */
.nav-item.active {
  background: rgba(255, 165, 0, 0.15);
  border-left: 3px solid #ffa500;
  color: #ffa500;
}
/* Hover */
.nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}
```

**Disabled nav items** (coming soon phases): color rgba(255,255,255,0.3), cursor default, no hover effect




## Do not use — ever

| ❌ Prohibited | ✅ Use instead |
|---|---|
| Box shadows on cards | Borders (1px #e0e0e0) |
| Gradients anywhere | Solid colors from palette |
| Border-radius > 6px on cards | 6px maximum |
| Animations > 150ms | Keep transitions fast |
| Colors outside the palette | Defined palette values only |
| Arial, Inter, system fonts | Roboto |
| Purple, teal, pink accents | Palette colors only |
| Inline styles for layout | CSS classes |
| Alert() or confirm() dialogs | Custom modal components |
| Placeholder text as labels | Always show a real label |
| Generic "Something went wrong" errors | Specific, actionable error messages |



## Prompting Claude with these guidelines

When asking Claude to build any UI component, include this in your prompt:

```
Follow the DealerAddendums design system:
- Colors: navy #2a2b3c, orange #ffa500, blue #1976d2, bg-app #3a6897
- Font: Roboto 14px base, weights 400/500/600/700
- Buttons: radius 4px, height 36px, primary=#1976d2, success=#4caf50, danger=#ff5252
- Cards: white bg, border 1px #e0e0e0, radius 6px, NO box-shadow
- Tables: header bg #f5f6f7 12px uppercase, rows white with #e0e0e0 borders
- NO gradients, NO shadows on cards, NO border-radius > 6px
- All UI follows DADesignGuidelines.md
```

Or simply add to your CLAUDE.md:
```
All UI must follow the design system in CLAUDE.md and DADesignGuidelines.md exactly.
```

---

## Quick reference card

```
┌─────────────────────────────────────────────┐
│  DEALERADDENDUMS — UI QUICK REFERENCE       │
├─────────────────────────────────────────────┤
│  COLORS                                     │
│  Navy      #2a2b3c   Sidebar/topbar         │
│  Orange    #ffa500   Nav accent             │
│  Blue      #1976d2   Primary buttons        │
│  Success   #4caf50   Save/confirm/printed   │
│  Error     #ff5252   Delete/destructive     │
│  BG App    #3a6897   Page background        │
│  Surface   #ffffff   Cards/panels           │
│  Subtle    #f5f6f7   Table alt rows         │
├─────────────────────────────────────────────┤
│  TYPOGRAPHY                                 │
│  Font: Roboto                               │
│  Base: 14px / 1.5 line-height               │
│  Headings: 18–32px weight 600               │
│  Labels: 14px weight 500                    │
│  Table headers: 12px uppercase weight 500   │
├─────────────────────────────────────────────┤
│  COMPONENTS                                 │
│  Buttons: h=36px radius=4px                 │
│  Inputs:  h=36px border=#e0e0e0 radius=4px  │
│  Cards:   border=1px #e0e0e0 radius=6px     │
│           NO box-shadow                     │
│  Badges:  radius=20px 11px bold             │
├─────────────────────────────────────────────┤
│  NEVER USE                                  │
│  × Gradients                                │
│  × Box shadows (modals only exception)      │
│  × Border-radius > 6px on cards             │
│  × Colors outside the palette               │
│  × Arial, Inter, system fonts               │
│  × Animations > 150ms                       │
└─────────────────────────────────────────────┘
```
