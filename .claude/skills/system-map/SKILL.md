---
name: system-map
description: How LangVoyage's parts connect — REST endpoints with their web/mobile callers and payload shapes, websocket events (sender, group, payload, handlers), data model and invariants, cache keys and invalidation, and end-to-end flows. Load before changing or debugging any endpoint, websocket event, payload, model, cache or cross-client behaviour, instead of re-reading the codebase.
---

# LangVoyage system map

Load only the file you need:

| File | Answers |
|---|---|
| `api-contract.md` | Every REST endpoint: view, auth/throttle, request/response, which web and mobile files call it, and fields clients depend on. Shared payload shapes. Cross-client change checklist. |
| `realtime-events.md` | Websocket URLs, auth and close codes, groups, presence semantics, and a catalog of every event (direction, sender, recipients, payload, web/mobile handlers). |
| `data-model.md` | ER diagram, fields, indexes, JSON formats, invariants (message status, blocking, conversation ordering), media storage. |
| `caching.md` | Backend cache keys (TTL, who sets/invalidates), channel layer and DB pool per env, React Query keys and socket-driven patches, browser/mobile storage keys, staleness gotchas. |
| `flows.md` | Step-by-step flows (login/refresh, open chat, send/receive message, presence, uploads, coach, translation, matching) with the exact files involved. |

## Keeping it true
Each file states the commit it was verified at and a `git diff --stat <commit>..HEAD -- <paths>` refresh command. Before relying on a section, run that diff; if relevant paths changed, re-read just those and update the section and its stamp in the same PR as the code change.
