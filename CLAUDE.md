# CLAUDE.md — da-marketing-os

> Suite-wide rules live in the suite root `CLAUDE.md` (symlinked from `da-ops`). This file only pins the rules most often missed when working inside this repo.

- **Definition of Done includes Steven (not optional):** every significant feature or behavior change here — dealer-facing OR internal/staff — also creates/updates the matching Help Center article(s) and is verified by asking Steven realistic questions. Canonical rule + exact method: `da-ops/docs/steven-knowledge.md` (suite root).
- Deploy only via this box's sanctioned path (the `deploy` skill / `da-ops/docs/runbooks/deploy.md`) — never a bare build-in-place.
- Session results go to `da-ops/docs/changelog-2026.md` + `da-ops/docs/open-items.md`, each entry with a `Steven:` line.
