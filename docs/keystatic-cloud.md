# Feature — Keystatic Cloud (Pro) for the prod CMS

> For Claude Code. Owner: Allan. Created 2026-06-02. **Supersedes the GitHub-mode plan.**
> The CMS (`/keystatic`) is `storage: { kind: 'local' }` — dev-only, so it 404s in
> prod. Switch to **Keystatic Cloud (Pro)** so the CMS works on the live site with
> seamless team auth: **no GitHub accounts for editors, no GitHub App, no env-var setup.**
> Allan's call: **all editors get access to all collections.** Home-page (Landing
> Pages) edits are governed by **team policy** (ask Allan first), NOT a technical gate.

## Why Cloud
- Editors (Marlena, Claire, Alex, Allan) just log into Keystatic and edit — no GitHub
  accounts, no custom GitHub App, no env-var juggling.
- Optional **Cloud Images** (hosted upload / optimize / deliver) — nice for the blog.
- Pro: $10/mo per team + $5/mo per user beyond 3 (~$15/mo for 4 editors).

## Part 1 — Allan (one-time, at keystatic.cloud)
1. Create a Keystatic Cloud account + **team**; create a **project** connected to the
   `dealeraddendums/da-marketing-os` GitHub repo (repo-admin step — Allan/Alex).
2. Upgrade the team to **Pro** (needed for >3 users).
3. Invite **Allan, Alex, Marlena, Claire** (team-level access = all can edit all
   collections; intended).
4. Copy the `[TEAM]/[PROJECT]` identifier from the project's settings page → give to CC.

## Part 2 — code (Claude Code)
- `keystatic.config.ts`:
  ```ts
  storage: { kind: 'cloud' },
  cloud: { project: '<TEAM>/<PROJECT>' },   // from the Cloud project settings page
  ```
- Confirm the Keystatic routes exist: `app/keystatic/[[...params]]` +
  `app/api/keystatic/[[...params]]` (`@keystatic/next`); add if missing. Cloud
  handles GitHub auth — **no `KEYSTATIC_GITHUB_*` env vars needed.**
- Deploy: `git pull && npm run build && pm2 restart da-marketing`.
- `/keystatic` now works on the live site; editors sign in via Keystatic Cloud.

## Notes
- **No CODEOWNERS / branch protection** — home-page edits are a team-policy
  convention (ask Allan first), not a technical lock.
- **Cloud Images (optional, later):** to move blog images off the repo/S3, enable the
  project's Image Library and switch image fields to `cloudImage`. Not required now.

## Verify
- `/keystatic` loads on the live site (post-cutover) / `localhost:3020/keystatic`
  locally, authenticating via Keystatic Cloud.
- A blog post **and** a landing page both save/commit to the repo through Cloud.
- Stop for review before deploy.
