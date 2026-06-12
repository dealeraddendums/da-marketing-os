# Runbook — stand up DA Marketing OS on a dedicated us-west-1 EC2

> Owner: Allan. Created 2026-06-02. One-time stand-up of `da-marketing-os` on its
> own box in **us-west-1**, then cut `dealeraddendums.com` DNS off HubSpot onto it.
> **DNS flips LAST.** The HubSpot site stays live the whole time, so rollback =
> point DNS back. Fill the placeholders below once the instance exists.

## Fill-in values (filled 2026-06-02)
```
ELASTIC_IP   = 54.176.9.39            # eipalloc-0737a00723eefd707, us-west-1
HOST         = ec2-54-176-9-39.us-west-1.compute.amazonaws.com
SSH          = ssh -i ~/ssh/DAHomePage.pem ubuntu@ec2-54-176-9-39.us-west-1.compute.amazonaws.com
SSH_KEY      = ~/ssh/DAHomePage.pem
SSH_USER     = ubuntu
INSTANCE_ID  = <i-... — grab from EC2 console>
SG_ID        = <sg-... — grab from EC2 console>
REGION       = us-west-1
APP_DIR      = /home/ubuntu/da-marketing-os
```

## 0. Instance (Allan, in AWS console)
- **Region us-west-1**, Ubuntu 22.04 LTS, **t3.small** (bump to t3.medium if blog
  generation feels heavy). Same VPC as DA Platform is fine but **not required** —
  the app reaches Supabase / HubSpot / Anthropic / Resend over the public internet,
  no VPC peering needed.
- Allocate + associate an **Elastic IP** (stable IP for the DNS record).
- Key pair → save as `~/ssh/<key>.pem` locally (`chmod 600`).

## 1. Security group (`SG_ID`)
- Inbound: **22** from Allan's IP only · **80** + **443** from `0.0.0.0/0`.
- **Do NOT expose 3020** — Nginx proxies to it on localhost.
- Outbound: allow all (egress to Supabase/HubSpot/Anthropic/Resend/PostHog).

## 2. Base packages (SSH in: `ssh -i $SSH_KEY $SSH_USER@$ELASTIC_IP`)
```bash
sudo apt update && sudo apt -y upgrade
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -   # Node 20 LTS
sudo apt -y install nodejs git nginx
sudo npm i -g pm2
sudo apt -y install certbot python3-certbot-nginx
```

## 3. Clone + configure + build
```bash
cd /home/ubuntu
git clone https://github.com/dealeraddendums/da-marketing-os.git
cd da-marketing-os
npm ci
```
- Create **`.env.production`** with the full env set. **Easiest + safest: copy the
  working `.env.local`** from the local repo verbatim (it's the source of truth) to
  the box as `.env.production` — don't hand-retype (var names drift, e.g.
  `HUBSPOT_API_KEY` vs `HUBSPOT_PRIVATE_APP_TOKEN`). From your machine:
  ```bash
  scp -i $SSH_KEY /Users/allantone/Sites/DA-Platform-Suite/da-marketing-os/.env.local \
    $SSH_USER@$ELASTIC_IP:/home/ubuntu/da-marketing-os/.env.production
  ```
- Env it must contain (see `.env.example`): `NEXT_PUBLIC_SITE_URL=https://dealeraddendums.com`,
  `ADMIN_PASSWORD`, `DA_CRON_KEY`, `ANTHROPIC_API_KEY`, PostHog key/host,
  `RESEND_API_KEY` + `LEAD_NOTIFY_EMAIL`, HubSpot token + `HUBSPOT_PORTAL_ID=23896347`,
  `BUFFER_API_KEY` (social), Supabase URL/anon/**service role** (project
  `huqohncglbshwuzeguvb`), the **read-only** `DA_PLATFORM_SUPABASE_*`, and the
  (stubbed) Google GBP vars.
```bash
npm run build
```

## 4. PM2 (port 3020)
```bash
pm2 start ecosystem.config.js          # name "da-marketing", start -p 3020
pm2 save
pm2 startup    # run the sudo command it prints, so it survives reboot
curl -I http://localhost:3020          # expect 200
```

## 5. Nginx reverse proxy
`/etc/nginx/sites-available/da-marketing`:
```nginx
server {
    listen 80;
    server_name dealeraddendums.com www.dealeraddendums.com;
    location / {
        proxy_pass http://localhost:3020;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/da-marketing /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 6. TLS — `www1` preview host now, www/apex at cutover (HTTP-01, no Route 53 plugin)
Use a **preview subdomain** `www1.dealeraddendums.com` → the box now. Because that
DNS points here, plain **HTTP-01** works immediately — no DNS-01 / Route 53 IAM
policy needed (simpler than the old plan).
- **Route 53 (Allan):** A record `www1.dealeraddendums.com` → `54.176.9.39`.
- **On the box:** `sudo certbot --nginx -d www1.dealeraddendums.com` → cert + 80→443
  redirect, auto-renews (HTTP-01, no AWS perms).
- **noindex the preview** so Google never indexes the staging URL / duplicate
  content: on the `www1` server block add
  `add_header X-Robots-Tag "noindex, nofollow" always;`. Keep
  `NEXT_PUBLIC_SITE_URL=https://dealeraddendums.com` (canonicals/OG already point to
  the real domain).
- **Turnstile (Allan):** add `www1.dealeraddendums.com` to the Turnstile widget's
  allowed hostnames (+ `localhost` for dev; add `www`/apex at cutover).
- **At cutover (step 9):** add `dealeraddendums.com` + `www` to Nginx + run
  `sudo certbot --nginx -d dealeraddendums.com -d www.dealeraddendums.com` (HTTP-01
  works once their DNS points here). Keep or drop `www1` afterward.

## 7. Preview BEFORE cutover — `https://www1.dealeraddendums.com`
With the `www1` host + cert (step 6), the whole team previews the real site over
HTTPS without touching production DNS. Smoke-test: `/` (+ a personalized hero),
`/blog` + a post, `/reputation`, the signup form (Turnstile + the `signup_completed`
attribution event), and `/keystatic` once Cloud is wired.
⚠️ **Test signups hit PRODUCTION DA Platform** (no staging) — use obvious test data
and delete the test Trial dealers / HubSpot companies afterward.

## 8. Re-point crons
The marketing OS exposes cron endpoints (e.g. `/api/cron/sync-reviews`, social
scheduling) authenticated by `DA_CRON_KEY` (`x-api-key`). Update the scheduler
(EasyCron or wherever these live) to hit the new host. **Confirm the exact job
list with Allan** — pre-DNS, target `http://ELASTIC_IP/...`; post-DNS they can use
`https://dealeraddendums.com/...`.

## 9. DNS cutover (LAST) — in Route 53
- Lower the TTL on the `dealeraddendums.com` + `www` records a few hours ahead.
- In Route 53, repoint off HubSpot → the box: an **A record** `dealeraddendums.com`
  → `54.176.9.39`, and `www` → same (HubSpot likely uses a CNAME/ALIAS today —
  replace with the A record). Use an Alias instead only if you later front it with an ALB.
- Cert is already in place from step 6, so HTTPS works immediately. Verify.

## 10. Post-cutover
- `pm2 logs da-marketing` — watch for errors; smoke-test the key routes again.
- Decommission the old marketing host (if one existed) once stable.
- **Planning Claude:** pin the real host in `CLAUDE-da-marketing-os.md` and replace
  the `<new-ec2-ip>` placeholder in `docs/ARCHITECTURE.md`.

## Security hardening (apply during setup)

**Network (Security Group) — the big one for a public box:**
- SSH (22): **Allan's IP only**, never `0.0.0.0/0`. Stronger: AWS SSM Session
  Manager and close 22 entirely (no public SSH surface).
- 80 + 443 public; **3020 never exposed** (Nginx proxies on localhost).
- Egress allow-all is fine.

**SSH / OS:**
- Key-only auth (Ubuntu default), root login disabled. `fail2ban` if 22 stays open.
- `sudo apt -y install unattended-upgrades` — auto security patches. Keep Node/nginx current.

**TLS / Nginx:**
- Force HTTPS (80 → 443; certbot adds this).
- `server_tokens off;`. Security headers: `Strict-Transport-Security` (HSTS),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: SAMEORIGIN` (or CSP `frame-ancestors`). Set in Nginx or Next `headers()`.
- Light `limit_req` rate-limiting on `/api/*` and admin/login paths.

**Secrets:**
- `.env.production` → `chmod 600`, owned by `ubuntu`, never committed (gitignored).
- **Rotate any secret shared/pasted during setup** once live — Supabase service-role,
  HubSpot token, Anthropic, Resend, `DA_CRON_KEY`.
- Strong, unique `ADMIN_PASSWORD` and `DA_CRON_KEY`.
- Never put server-side secrets behind `NEXT_PUBLIC_` (those ship to the browser);
  only Supabase URL + anon key are public, service-role stays server-only.

**Cross-project (protect DA Platform data):**
- `DA_PLATFORM_SUPABASE_SERVICE_KEY` reads DA Platform — use a **least-privilege /
  read-only** key (read-only Postgres role), NOT a full service role, so a
  compromise of this box can never write to DA Platform (matches the "DA Platform
  is source of truth / never write" rule).

**App auth:**
- Confirm `/api/cron/*` reject requests without the `DA_CRON_KEY` header (401).
- Confirm `/reputation` (and `/keystatic` if not GitHub-OAuth) are gated by
  `da_admin_auth`; cookie should be `Secure` + `HttpOnly` + `SameSite`.
- Supabase (`huqohncglbshwuzeguvb`): RLS on for anything reachable by the anon key.

**S3 (only if the app writes blog images):**
- Use an **IAM instance role** scoped to the `littlefarmblogimages` bucket — don't
  put AWS access keys in `.env`. (Read-only public URLs need no creds.)

**Recommended extras:**
- **Cloudflare** in front (free): WAF, rate-limiting, hides the origin Elastic IP,
  caches static assets — good fit for a public marketing site.
- `pm2 install pm2-logrotate`; enable account-level CloudTrail; take an AMI snapshot
  once configured.

## Going forward (deploys) — matches existing docs / Marlena's flow
```bash
cd /home/ubuntu/da-marketing-os && git pull && npm run build && pm2 restart da-marketing
```

## Rollback
The HubSpot site stays live until the DNS flip — if anything's wrong after cutover,
point the A/ALIAS records back to HubSpot. No data loss (Supabase/Keystatic-git are
unaffected by the front-end host).
