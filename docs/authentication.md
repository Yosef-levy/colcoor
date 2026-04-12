# Authentication — Cursor account (Colcoor extension)

The **Colcoor** extension uses the **same identity providers** that Cursor / VS Code use for editor sign-in (**GitHub**, **Microsoft**, **Google** via `vscode.authentication`), then exchanges that access token for a **Colcoor backend JWT**. This is separate from any web app Google Sign-In flow.

**Monetization:** every API call must carry a valid backend JWT so the server can enforce plans and quotas — see [monetization.md](monetization.md).

## 1. Requirements

- Users can use the orchestrator **without** signing in through a separate web UI.
- The **extension backend** must know **who** is calling for membership, private branches, side chat identity, and billing.
- Secrets must **not** live in workspace files; use VS Code / Cursor [SecretStorage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage) for the **backend JWT** only. IdP access tokens are held in memory for the exchange request only.

## 2. Client-side flow (implemented)

1. User runs **Colcoor: Sign in** and picks **GitHub**, **Microsoft**, or **Google** (whichever matches how they use Cursor).
2. The extension calls **`vscode.authentication.getSession(providerId, scopes, { createIfNone: true })`** with:
   - **github** — scopes `read:user`, `user:email`
   - **microsoft** — scopes `openid`, `profile`, `email`, `User.Read`
   - **google** — scopes `openid`, `profile`, `email` (only if the Google auth provider is available in your build)
3. The extension **`POST`s** `{"cursor_access_token": "<session.accessToken>", "provider_hint": "github"|"microsoft"|"google"}` to **`/api/v1/auth/cursor`**.
4. On success, the extension stores **`access_token`** (Colcoor JWT) in SecretStorage and sends **`Authorization: Bearer <jwt>`** on later API calls.

**Non-production:** **Colcoor: Sign in (dev)** still calls **`POST /api/v1/auth/dev-login`** (disabled when `COLCOOR_ENV=production`).

## 3. Backend trust model (implemented)

**Pattern A — token exchange** (as recommended in earlier drafts):

- **`POST /api/v1/auth/cursor`** accepts `cursor_access_token` and optional `provider_hint` (`auto` or a single provider).
- The backend **does not trust opaque strings**. It validates the token by calling the provider’s **HTTPS userinfo API**:
  - **GitHub:** `GET https://api.github.com/user` (+ `/user/emails` if needed)
  - **Microsoft:** `GET https://graph.microsoft.com/v1.0/me`
  - **Google:** `GET https://www.googleapis.com/oauth2/v3/userinfo`
- On success, the backend **upserts** `users` using a stable **`cursor_sub`**:
  - `github:{numeric_id}`
  - `microsoft:{graph_object_id}`
  - `google:{sub}`
- It issues an **HS256 JWT** (`sub` = internal user UUID) via **`JWT_SECRET`**. Subsequent requests use **only** this JWT.

**Configuration:**

| Variable | Purpose |
|----------|---------|
| `CURSOR_AUTH_PROVIDER_ORDER` | Comma-separated probe order when `provider_hint` is **`auto`** (default `github,microsoft,google`). Unknown entries are ignored. |
| `CURSOR_AUTH_HTTP_TIMEOUT_SECONDS` | Upstream IdP HTTP timeout (default **12**, max **60**). |

**Errors:** invalid or expired IdP tokens → **401** with a generic message (no token or provider leakage in logs beyond “verification failed”).

## 4. User provisioning

On each successful **`/auth/cursor`**:

- **Find or create** `users` by **`cursor_sub`**.
- Refresh **email**, **display_name**, **last_login_at**; set **avatar_url** when the IdP returns one (existing avatars are not cleared when the IdP omits a URL).

The extension backend is **separate** from a web backend; the same person may have **two user rows** unless you add explicit **account linking** (out of scope here).

## 5. Profile and display name

- Profile fields **sync from the IdP** on each **`/auth/cursor`** success.
- Optional future: **`PATCH /me/profile`** on this API for display name overrides (see earlier `implementation.md` references).

## 6. Security notes

- Use **HTTPS** between the extension and the Colcoor API in production.
- **Rotate `JWT_SECRET`** on compromise; use a long random value (see production validation).
- **Log** auth failures **without** logging full tokens or upstream responses.

## 7. Implementation status

- [x] **`POST /auth/cursor`** with GitHub / Microsoft Graph / Google userinfo verification and Colcoor JWT issuance.
- [x] Extension **Sign in** command using **`vscode.authentication.getSession`** and token exchange.
- [x] **`users.cursor_sub`** stable external key and profile upsert.
- [ ] Confirm any **Cursor-specific** auth provider id if Cursor adds a first-party provider beyond VS Code’s built-ins; extend `extensionAccounts.ts` if needed.
