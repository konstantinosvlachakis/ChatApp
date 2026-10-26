---
name: langvoyage-codebase
description: Orient work in the LangVoyage ChatApp repository, locate the relevant backend, web, or mobile code, and choose focused verification. Use for implementation or review tasks in this repo.
---

# LangVoyage codebase

This repository has a Django/DRF/Channels backend (`backend/`), a React web app (`frontend/`), and an Expo mobile app (`mobile/`). Start at the repository root (`git rev-parse --show-toplevel`).

Read `.claude/skills/project-status/SKILL.md` for the product and repo map, then read only the area notes relevant to the task:

- Backend: `.claude/skills/backend-status/SKILL.md`
- Web: `.claude/skills/web-status/SKILL.md`
- Mobile: `.claude/skills/mobile-status/SKILL.md`

These notes have commit stamps and can be stale. Before relying on a section, compare its stamped commit with `HEAD` for the relevant paths using `git log` or `git diff`, then inspect changed code. Prefer current code over a stale note. Update the affected note when a code change makes it inaccurate.

For an endpoint, websocket event, payload, model, cache, or cross-client flow, also use `langvoyage-contracts` and the relevant system-map page.

Choose verification from the changed area: `scripts/test-backend.ps1` for backend, `scripts/check-web.ps1` for web, and `npx tsc --noEmit` in `mobile/`. Check the scripts and current dependency state before running them; report pre-existing or environment failures separately from regressions.
