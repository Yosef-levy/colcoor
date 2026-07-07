# Monetization and feature gating — Colcoor extension

All **durable state** and **entitlement checks** live in the **Colcoor backend**. The extension **MUST**:

- **Authenticate** the user ([authentication.md](authentication.md))
- Send **`Authorization: Bearer <token>`** on **every** `**/api/v1/**` request
- **Honor** HTTP **402** and **403** responses without client-side bypass

**Counters, ledger rows, and when they increment:** **[billing-usage.md](billing-usage.md)**.

**HTTP error shapes:** **[api-contracts.md](../product/api-contracts.md)** (introduction).

---

## Plans

Plan codes, Stripe linkage, and per-plan feature flags are stored in **`subscriptions`** / **`billing_customers`** ([database.md](../product/database.md)). Exact commercial packaging is **operations-defined**; the extension **MUST** surface **`detail`** from error responses and any upgrade affordance the API returns.

---

## UX

When the server denies an action, the extension **MUST** show a clear, user-facing message and **MUST NOT** silently retry in a way that bypasses billing ([ui-features.md](../product/ui-features.md) §3).
