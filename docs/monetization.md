# Monetization and feature gating — extension

All **durable state** lives in the **Colcoor extension backend**. The extension must:

- **Authenticate** the user (see [authentication.md](authentication.md))
- Send a valid **token** on **every** API request
- **Respect** server-enforced feature gating (HTTP 402/403 or contract-specific error bodies as implemented)

## Tiers (product intent)

**Free (example policy):**

- Single-user usage patterns
- Limited usage (quotas enforced server-side)

**Paid (example policy):**

- **Collaboration** (shared conversations / membership)
- **Shared trees** (multi-user visibility rules)
- **Side chat**
- Other **advanced** features as defined in backend policy / `plans`-style config

Exact limits and entitlements are **backend-defined**; the extension surfaces errors and upgrade paths in UX-appropriate copy (without exposing raw orchestration details — see [principles.md](principles.md) UX section).

## Implementation notes

- Reuse or mirror billing and plan enforcement from the web stack **only** inside the **extension** deployment codebase; web and extension backends remain **separate** deployments (see [README.md](README.md)).
- Side chat and collaboration should be **disabled or hidden** when the server rejects access, not bypassed client-side.
