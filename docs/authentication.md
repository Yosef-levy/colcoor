# Authentication — Colcoor extension

The extension obtains a **Colcoor API JWT** by calling **`POST /api/v1/auth/cursor`** with a **Cursor / VS Code identity-provider access token**. All other Colcoor APIs use **`Authorization: Bearer <access_token>`**.

There is **no** alternate development-only login HTTP route; the same **`POST /api/v1/auth/cursor`** contract applies in every environment.

**Normative API:** [api-contracts.md](api-contracts.md) §2.1.

**Billing and quotas:** [monetization.md](monetization.md), [billing-usage.md](billing-usage.md).

---

## 1. Stable identity: `cursor_sub`

- The **`users.cursor_sub`** column is the **only** stable external identity key for the extension product. It is **unique**, **non-null**, and set when the user is first provisioned via **`POST /api/v1/auth/cursor`**.
- The value is an **opaque string** produced by the backend after successful verification of the caller’s provider token. Clients **MUST NOT** parse or interpret `cursor_sub`; they **MUST** treat it as an opaque identifier in any UI that surfaces internal ids.

---

## 2. Client flow

1. Acquire a provider access token via **`vscode.authentication.getSession`** (scopes and provider ids are defined in the extension implementation; they are **not** part of this identity spec).
2. **`POST /api/v1/auth/cursor`** with body **`{ "cursor_access_token": "<token>", "provider_hint": "auto" | "github" | "microsoft" | "google" }`**.
3. Store **`access_token`** from **`AuthResponse`** in **SecretStorage** (or equivalent). Omit from workspace files.
4. Send **`Authorization: Bearer <access_token>`** on every **`/api/v1/...`** request until expiry; then repeat from step 1.

---

## 3. Backend behavior

1. Verify the supplied access token using the configured verifier(s) (HTTPS profile calls to the identity provider). If verification fails, respond **401** ([api-contracts.md](api-contracts.md)).
2. Derive the opaque **`cursor_sub`** string used for lookup (implementation-defined derivation **MUST** be injective per provider so distinct accounts never collide).
3. **Find or create** **`users`** by **`cursor_sub`**. Update **`email`**, **`display_name`**, **`avatar_url`**, **`last_login_at`** when the verifier returns new profile data.
4. Issue the Colcoor JWT (**`sub`** claim = internal **`users.id`** uuid). JWT signing and expiry are implementation-defined but **MUST** use a server secret configured out of band ([production.md](production.md)).

---

## 4. Profile

**`PATCH /api/v1/me`** updates **`display_name`** and/or **`avatar_url`** for the authenticated user ([api-contracts.md](api-contracts.md) §9). The response **MAY** include a new **`access_token`** if claims must change.

---

## 5. Security

- **HTTPS only** between extension and Colcoor API in production.
- Rotate JWT signing keys per operational policy; allow small clock skew on **`exp`**.
- **Do not** log full bearer tokens or raw provider tokens.

---

## Related docs

- [database.md](database.md) — **`users`** table.
- [permissions.md](permissions.md) — authorization after authentication.
