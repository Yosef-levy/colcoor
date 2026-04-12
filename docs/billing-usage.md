# Billing and usage — Colcoor extension backend

Normative semantics for **metering**, **aggregation**, and **HTTP denial** when limits apply. Plan definitions (`plan_code`, Stripe linkage) live in **`subscriptions`** / **`billing_customers`** ([database.md](database.md)); this document defines **what** is counted and **when**.

---

## 1. Counters (`usage_monthly`)

Table **`usage_monthly`** holds **one row per `(user_id, month_key)`** where **`month_key`** matches **`YYYY-MM`** (UTC month bucket).

| Column | Incremented when |
|--------|------------------|
| `messages_sent` | After each successful **`POST …/append-event`** with **`kind`** = **`user_input`** that is accepted and committed (not rolled back). |
| `branches_created` | After each accepted **`user_input`** with **`private_branch`** = **true** (start of a private draft branch). |
| `assistant_generations` | After each successful **`append-event`** with **`kind`** = **`assistant_output`** that is accepted and committed. |
| `tokens_input` | After each **`assistant_output`** append for which the agent run reported input token usage (integer added to column). If unknown, add **0**. |
| `tokens_output` | Same as `tokens_input`, for output tokens. |

**Timing:** **`usage_monthly`** counters are updated **after** the database transaction that persists the triggering row **commits** (same request lifecycle, post-commit hook or explicit update).

---

## 2. Ledger (`usage_events`)

Table **`usage_events`** is an **append-only ledger** of increments for auditing, replays, and analytics.

| Column | Role |
|--------|------|
| `user_id` | Subject of the charge |
| `conversation_id` | Scope when applicable |
| `event_id` | Links to **`events.id`** when the metric ties to a graph event |
| `metric_code` | One of: **`messages_sent`**, **`branches_created`**, **`assistant_generations`**, **`tokens_input`**, **`tokens_output`** (must match **database** `CHECK`) |
| `quantity` | Integer delta (usually **1** for counts; token deltas for token metrics) |
| `unit` | Unit code (e.g. `count`, `token`) |
| `metadata_json` | Optional dimensions (model id, request id) |

**Timing:** insert **`usage_events`** in the **same** transaction as the state change that caused it (so ledger and graph stay consistent), **before** commit.

**Relationship to `usage_monthly`:** each increment **MUST** produce at least one **`usage_events`** row **and** the corresponding bump to **`usage_monthly`** for the same user and UTC **`month_key`**, using the same **`metric_code`** semantics.

---

## 3. Difference summary

| | `usage_monthly` | `usage_events` |
|--|-----------------|----------------|
| **Purpose** | Fast quota checks; dashboard aggregates | Audit trail; per-event attribution |
| **Cardinality** | One row per user per month | Many rows per user |
| **Mutable** | Counters updated in place | Insert-only |

---

## 4. Enforcement and HTTP status

Before accepting a metered action (e.g. **`user_input`** append, new conversation), the server **MUST** evaluate the caller’s plan and current **`usage_monthly`** (and any hard caps).

| Condition | HTTP | Response |
|-----------|------|----------|
| Authenticated but plan disallows feature entirely | **403** | `detail` explains feature disabled |
| Authenticated, feature allowed, quota exceeded for paid upgrade path | **402** | `detail` explains quota / upgrade |
| Authenticated, limit exceeded without payment remedy (hard cap) | **403** | `detail` explains cap |

**402** is reserved for **payment / upgrade required** flows; **403** for **forbidden by policy or role** (see also [permissions.md](permissions.md)).

---

## 5. Related docs

- [database.md](database.md) — `usage_monthly`, `usage_events`, `subscriptions` DDL.
- [monetization.md](monetization.md) — product intent for tokens on every request and UI behavior.
- [api-contracts.md](api-contracts.md) — which routes return **402**.
