---
name: langvoyage-contracts
description: Trace and safely change LangVoyage REST payloads, websocket events, models, caches, or flows shared by the Django backend and React or Expo clients. Use for cross-client features and contract reviews in this repo.
---

# LangVoyage contracts

The authoritative task map is `.claude/skills/system-map/SKILL.md` at the repository root. Read only the page that matches the change:

- `api-contract.md` for REST routes, payloads, and client callers.
- `realtime-events.md` for websocket producers, recipients, payloads, and handlers.
- `data-model.md` for fields, indexes, and data invariants.
- `caching.md` for backend and client cache keys and invalidation.
- `flows.md` for end-to-end behavior.

Each page has a verified commit. Diff the listed paths from that commit to `HEAD` before relying on a contract, and inspect changed code when needed.

When changing a shared contract, trace the backend producer and both web and mobile consumers. Keep event names and payload assumptions aligned in the same change. For chat messages, check the distinction between the capped conversation-detail messages and paged older history, server-originated message broadcasts, and fields that must stay private to one user. For backend list serialization, inspect query prefetching and the query-count tests. For auth or realtime work, inspect participant checks, blocking, cookie CSRF, socket authentication, and close-code handling in the relevant code and tests.

Run focused checks for the touched layers. Update the affected system-map page and its verified stamp when the contract or flow changes. Do not copy the map into this skill; keeping one detailed source avoids divergence.
