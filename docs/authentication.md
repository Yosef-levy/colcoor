# Authentication — Cursor account (Colcoor extension)

The **Colcoor** extension uses **Cursor account identity** instead of the web app’s **Google Sign-In** flow (`POST /auth/google`, JWT with `sub` = user id, as in `implementation.md` §9a).

**Monetization:** every API call must carry a valid session token so the backend can enforce plans and quotas — see [monetization.md](monetization.md).

## 1. Requirements

- Users must be able to use the orchestrator **without** signing in through the web UI.
- The **extension backend** must know **who** is calling so it can enforce conversation membership, private branches, side chat author identity, and billing.
- Secrets must **not** live in workspace files; use the VS Code / Cursor [SecretStorage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage) (or equivalent) for tokens.

## 2. Client-side flow (normative intent)

1. On first use (or when the session is missing/expired), the extension triggers **authentication with Cursor** using the extension host API:
   - Prefer **`vscode.authentication.getSession`** with a **provider id** that Cursor documents for **Cursor account** or **Microsoft/GitHub** if that is what Cursor exposes as the signed-in user for extensions.
   - If Cursor provides a **dedicated** auth API for marketplace extensions, use that as specified in Cursor’s current documentation.
2. The extension obtains an **access token** (or ID token) that identifies the user **to your backend**.
3. The extension sends that token on each request: `Authorization: Bearer <token>` (or a header your backend defines).

The exact **provider id** and **token type** are **Cursor-version-dependent**; keep them in extension configuration constants and document them in the extension’s own README when implemented.

## 3. Backend trust model

The extension backend **must not** blindly trust opaque strings. Choose one of these patterns (or combine):

**A) Token exchange (recommended)**

- Extension sends Cursor-issued token to **`POST /auth/cursor`** (or similar).
- Backend validates the token with **Cursor’s documented token verification** (JWKS, issuer, audience) or calls a **Cursor introspection endpoint** if available.
- Backend issues its **own** session JWT (same shape as web’s `AuthResponse` if you want code reuse) with `sub` = internal `user_id`, and returns it to the extension.
- Subsequent API calls use the **backend JWT** only.

**B) Direct pass-through**

- Backend validates Cursor access tokens on every request. This can be simpler but may be heavier and more coupled to token lifetime and Cursor API changes.

**C) OAuth2 authorization code with Cursor as IdP**

- If Cursor exposes standard OAuth2 for third-party apps, the extension could open a system browser and complete a code exchange. Use this only if it matches Cursor’s official integration story.

Until Cursor publishes a stable verification method, treat **A** with a small **`/auth/cursor`** handler as the default design: one place to swap Cursor identity for an internal session.

## 4. User provisioning

On first successful Cursor auth:

- **Find or create** a row in your `users` table. Store stable identifiers from the verified token (e.g. subject claim, email if present and verified).
- **Do not** require `google_sub`; add columns such as `cursor_sub` or a generic `oauth_sub` + `provider` enum, depending on how you want to separate web vs extension accounts.

Because the extension backend is **separate** from the web backend, the same person may have **two unrelated user records** (one per product) unless you later build an explicit **account linking** feature — which is **out of scope** for this doc set.

## 5. Profile and display name

Side chat and membership UIs need display names (`implementation.md` §11 references `PATCH /me/profile`).

- Either **sync** display name from the verified Cursor profile on each login, or  
- Let the user edit it via **`PATCH /me/profile`** on the extension backend only.

Ensure JWT claims used in side-chat SSE payloads stay consistent after renames (same pattern as web: optional new `access_token` on profile patch).

## 6. Security notes

- Use **HTTPS** for all extension backend traffic.
- Rotate signing keys for backend-issued JWTs; support clock skew as usual.
- Log authentication failures without logging full tokens.

## 7. Open implementation tasks

- [ ] Confirm **Cursor’s** official extension auth API and provider id(s) for the target release year.
- [ ] Implement **`POST /auth/cursor`** (or chosen equivalent) and JWT issuance aligned with existing `AuthResponse` types if sharing code with the web backend module.
- [ ] Add **migration** or **schema** for non-Google identity fields on `users` if reusing the same SQLModel definitions.
