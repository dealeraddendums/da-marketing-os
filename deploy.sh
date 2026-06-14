#!/usr/bin/env bash
# da-marketing-os — hardened in-place deploy.
#
#   Run ON THE BOX:  bash /home/ubuntu/da-marketing-os/deploy.sh            # deploy origin/main
#                    bash /home/ubuntu/da-marketing-os/deploy.sh <commit>   # deploy a specific commit
#
# Why this exists: a previous deploy ran `git pull && npm run build && pm2 restart`
# inline. `next build` wipes .next at the start, so a FAILED build left a broken
# .next AND the blind restart crash-looped the site (502 on every route). This
# script never restarts on a bad build and preserves the last-good .next so the
# on-disk build always stays valid:
#   - back up the live .next before building
#   - if the build fails or is incomplete (no BUILD_ID): restore the backup, DON'T
#     restart (the running process keeps serving the previous build), exit 1
#   - only on a verified build: restart, then HTTP health-gate; if unhealthy,
#     roll back code + build and restart.

set -euo pipefail

APP=da-marketing
DIR=/home/ubuntu/da-marketing-os
PORT=3020
HEALTH_URL="http://127.0.0.1:$PORT/"
TARGET="${1:-origin/main}"

cd "$DIR"
[ -d .git ] || { echo "[deploy] $DIR is not a git checkout."; exit 1; }
[ -f .env.production ] || { echo "[deploy] missing .env.production."; exit 1; }

PREV_SHA=$(git rev-parse HEAD)
echo "[deploy] fetch + checkout $TARGET (was $PREV_SHA)…"
git fetch --quiet origin
PRE_LOCK=$(sha1sum package-lock.json 2>/dev/null || true)
git checkout --quiet --detach "$TARGET"
git pull --quiet --ff-only origin "$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null || echo main)" 2>/dev/null || true
SHA=$(git rev-parse --short HEAD)

# Preserve the last-good build BEFORE `next build` wipes .next.
rm -rf .next.prev
[ -d .next ] && cp -a .next .next.prev

# Reinstall deps only when the lockfile changed (keeps routine deploys fast).
if [ "$PRE_LOCK" != "$(sha1sum package-lock.json 2>/dev/null || true)" ]; then
  echo "[deploy] package-lock changed — npm ci…"
  npm ci
fi

echo "[deploy] building $SHA…"
build_ok=1
npm run build || build_ok=0

if [ "$build_ok" = 0 ] || [ ! -f .next/BUILD_ID ]; then
  echo "[deploy] BUILD FAILED/INCOMPLETE — NOT restarting; restoring previous build."
  if [ -d .next.prev ]; then rm -rf .next; mv .next.prev .next; fi
  echo "[deploy] the running app is untouched (still serving the previous build). Aborting."
  exit 1
fi

echo "[deploy] build OK ($(cat .next/BUILD_ID)); restarting pm2 $APP…"
pm2 restart "$APP" --update-env >/dev/null

# Health gate — require a real HTTP 200; roll back code+build if it never comes up.
healthy=
for i in $(seq 1 15); do
  sleep 2
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" || true)
  if [ "$code" = "200" ]; then healthy=1; echo "[deploy] health OK (200) after $((i*2))s"; break; fi
done

if [ -z "$healthy" ]; then
  echo "[deploy] UNHEALTHY (no HTTP 200 in ~30s) — rolling back to $PREV_SHA."
  git checkout --quiet --detach "$PREV_SHA" || true
  if [ -d .next.prev ]; then rm -rf .next; mv .next.prev .next; fi
  pm2 restart "$APP" --update-env >/dev/null || true
  echo "[deploy] rolled back. Investigate: pm2 logs $APP"
  exit 1
fi

rm -rf .next.prev
echo "[deploy] done. $SHA is live."
