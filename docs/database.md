# Database schema — extension backend (PostgreSQL)

Normative DDL for the Colcoor extension-dedicated API. **PostgreSQL 16+.** UUID PKs; **`timestamptz`**; **`gen_random_uuid()`** defaults (built-in).

**HTTP mapping:** [api-contracts.md](api-contracts.md). **Identity:** [authentication.md](authentication.md) (`cursor_sub`).

---

## 1. users

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | User row |
| email | text not null | Contact / billing |
| display_name | text not null default '' | UI label |
| avatar_url | text null | Profile image URL |
| cursor_sub | text not null unique | **Stable opaque identity** assigned at first successful **`POST /api/v1/auth/cursor`**; unique key for provisioning |
| handle | text null unique | Public @handle |
| created_at | timestamptz not null | Row created |
| last_login_at | timestamptz not null | Last successful auth |

---

## 2. conversations

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | Conversation |
| title | text null | Display title (shared) |
| created_at | timestamptz not null | Created |
| updated_at | timestamptz not null | Last structural/content touch |

---

## 3. conversation_members

| Column | Type | Purpose |
|--------|------|---------|
| conversation_id | uuid PK FK | Conversation |
| user_id | uuid PK FK | Member user |
| role | text not null default 'editor' | owner \| editor \| viewer |
| pinned | boolean not null default false | **Per-user** sidebar pin for this conversation |

---

## 4. events

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | Event node |
| conversation_id | uuid FK not null | Owning conversation |
| parent_event_id | uuid FK null | Tree parent |
| kind | text not null | **`user_input`** \| **`assistant_output`** only (`CHECK` enforced) |
| actor_type | text not null | user \| assistant |
| actor_user_id | uuid FK null | Human actor when applicable |
| content_text | text null | Plain body |
| content_json | jsonb null | Structured payload |
| checkpoint_label | text null | Optional display-only label for checkpoint / breadcrumb UI ([ui-features.md] §8) |
| visible_to | uuid FK null | **NULL** = shared (all members); **non-NULL** = private draft for that `users.id` only |
| deleted_at | timestamptz null | Soft delete |
| created_at | timestamptz not null | Inserted |
| updated_at | timestamptz not null | Last mutation |

---

## 5. conversation_user_state

| Column | Type | Purpose |
|--------|------|---------|
| conversation_id | uuid PK FK | Conversation |
| user_id | uuid PK FK | Member |
| active_event_id | uuid FK not null | Selected tree node |
| last_seen_at | timestamptz not null | Presence / stale UI |
| needs_context_rebuild | boolean not null default false | Next-send context flag |

---

## 6. notes

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | Note |
| event_id | uuid FK not null | Host message |
| author_user_id | uuid FK not null | Writer |
| content | text not null | Body |
| created_at | timestamptz not null | Created |
| updated_at | timestamptz not null | Edited |

---

## 7. event_stars

| Column | Type | Purpose |
|--------|------|---------|
| user_id | uuid PK FK | Who starred |
| event_id | uuid PK FK | Starred event |
| created_at | timestamptz not null | When starred |

---

## 8. side_chat_messages

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | Message row |
| conversation_id | uuid FK not null | Thread |
| seq | int not null | Monotonic ordering per conversation |
| kind | text not null | `user` \| `system_join` \| `system_leave` (CHECK) |
| author_user_id | uuid FK null | Human author |
| body | text null | Text |
| referenced_event_id | uuid FK null | Thread ref: main event |
| referenced_note_id | uuid FK null | Thread ref: note |
| referenced_side_chat_message_id | uuid FK null | Thread ref: prior side message |
| created_at | timestamptz not null | Inserted |
| updated_at | timestamptz not null | Row touch |
| edited_at | timestamptz null | User-visible edit |
| deleted_at | timestamptz null | Soft delete |

---

## 9. user_side_chat_state

| Column | Type | Purpose |
|--------|------|---------|
| conversation_id | uuid PK FK | Thread |
| user_id | uuid PK FK | Reader |
| last_read_seq | int not null default 0 | Read cursor |

---

## 10. billing_customers

| Column | Type | Purpose |
|--------|------|---------|
| user_id | uuid PK FK | Owner |
| provider | text not null default 'stripe' | PSP id |
| provider_customer_id | text not null | PSP customer id |
| email | text not null | Billing email snapshot |
| created_at | timestamptz not null | First link |
| updated_at | timestamptz not null | Last sync |

---

## 11. subscriptions

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | Subscription row |
| user_id | uuid FK not null | Subscriber |
| provider | text not null | PSP id |
| provider_subscription_id | text not null | PSP subscription id |
| plan_code | text not null | Internal plan key |
| status | text not null | active \| canceled \| trialing \| … |
| billing_state | text not null | PSP-specific coarse state |
| current_period_start | timestamptz not null | Billed window |
| current_period_end | timestamptz not null | Billed window end |
| cancel_at_period_end | boolean not null | Scheduled cancel |
| canceled_at | timestamptz null | When canceled |
| created_at | timestamptz not null | Row created |
| updated_at | timestamptz not null | Last webhook / sync |

---

## 12. processed_billing_events

| Column | Type | Purpose |
|--------|------|---------|
| provider | text PK | PSP id |
| event_id | text PK | PSP webhook event id |
| event_type | text not null | Event name |
| processed_at | timestamptz not null | Idempotency receipt time |

---

## 13. usage_monthly

| Column | Type | Purpose |
|--------|------|---------|
| user_id | uuid PK FK | User |
| month_key | text PK | YYYY-MM bucket |
| messages_sent | int not null default 0 | Count |
| branches_created | int not null default 0 | Count |
| assistant_generations | int not null default 0 | Count |
| tokens_input | int not null default 0 | Tokens |
| tokens_output | int not null default 0 | Tokens |
| created_at | timestamptz not null | First touch month |
| updated_at | timestamptz not null | Last counter bump |

---

## 14. usage_events

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | Ledger line |
| user_id | uuid FK not null | Subject |
| conversation_id | uuid FK null | Scope |
| event_id | uuid FK null | Related graph event |
| metric_code | text not null | `messages_sent` \| `branches_created` \| `assistant_generations` \| `tokens_input` \| `tokens_output` (`CHECK` in DDL) |
| quantity | int not null | Amount |
| unit | text not null | unit code |
| metadata_json | jsonb null | Extra dimensions |
| created_at | timestamptz not null | Emitted |

---

## DDL

```sql
-- 1. users
CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    display_name text NOT NULL DEFAULT '',
    avatar_url text,
    cursor_sub text NOT NULL,
    handle text,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_users_cursor_sub UNIQUE (cursor_sub),
    CONSTRAINT uq_users_handle UNIQUE (handle)
);
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_last_login_at ON users (last_login_at);

-- 2. conversations
CREATE TABLE conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_updated_at ON conversations (updated_at);

-- 3. conversation_members
CREATE TABLE conversation_members (
    conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'editor',
    pinned boolean NOT NULL DEFAULT false,
    CONSTRAINT pk_conversation_members PRIMARY KEY (conversation_id, user_id),
    CONSTRAINT ck_conversation_members_role CHECK (role IN ('owner', 'editor', 'viewer'))
);
CREATE INDEX idx_conversation_members_user_id ON conversation_members (user_id);
CREATE UNIQUE INDEX uq_conversation_single_owner ON conversation_members (conversation_id)
    WHERE (role = 'owner');

-- 4. events
CREATE TABLE events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    parent_event_id uuid REFERENCES events (id) ON DELETE RESTRICT,
    kind text NOT NULL,
    actor_type text NOT NULL,
    actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
    content_text text,
    content_json jsonb,
    visible_to uuid REFERENCES users (id) ON DELETE SET NULL,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_events_kind CHECK (kind IN ('user_input', 'assistant_output')),
    CONSTRAINT ck_events_actor_type CHECK (actor_type IN ('user', 'assistant'))
);
COMMENT ON COLUMN events.visible_to IS 'NULL = shared with all conversation members; non-NULL = private draft visible only to that user.';
CREATE INDEX idx_events_parent_event_id ON events (parent_event_id);
CREATE INDEX idx_events_kind ON events (kind);
CREATE INDEX idx_events_actor_type ON events (actor_type);
CREATE INDEX idx_events_actor_user_id ON events (actor_user_id);
CREATE INDEX idx_events_visible_to ON events (visible_to);
CREATE INDEX idx_events_deleted_at ON events (deleted_at);
CREATE INDEX idx_events_created_at ON events (created_at);
CREATE INDEX idx_events_updated_at ON events (updated_at);
CREATE INDEX idx_events_conversation_parent ON events (conversation_id, parent_event_id);

-- 5. conversation_user_state
CREATE TABLE conversation_user_state (
    conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    active_event_id uuid NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    needs_context_rebuild boolean NOT NULL DEFAULT false,
    CONSTRAINT pk_conversation_user_state PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX idx_conversation_user_state_last_seen ON conversation_user_state (last_seen_at);
CREATE INDEX idx_conversation_user_state_active_event ON conversation_user_state (active_event_id);

-- 6. notes
CREATE TABLE notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    author_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notes_event_id ON notes (event_id);
CREATE INDEX idx_notes_created_at ON notes (created_at);

-- 7. event_stars
CREATE TABLE event_stars (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_event_stars PRIMARY KEY (user_id, event_id)
);
CREATE INDEX idx_event_stars_created_at ON event_stars (created_at);

-- 8. side_chat_messages
CREATE TABLE side_chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    seq integer NOT NULL,
    kind text NOT NULL,
    author_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
    body text,
    referenced_event_id uuid REFERENCES events (id) ON DELETE SET NULL,
    referenced_note_id uuid REFERENCES notes (id) ON DELETE SET NULL,
    referenced_side_chat_message_id uuid REFERENCES side_chat_messages (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    edited_at timestamptz,
    deleted_at timestamptz,
    CONSTRAINT uq_side_chat_messages_conversation_seq UNIQUE (conversation_id, seq),
    CONSTRAINT ck_side_chat_messages_kind CHECK (kind IN ('user', 'system_join', 'system_leave'))
);
CREATE INDEX idx_side_chat_messages_kind ON side_chat_messages (kind);
CREATE INDEX idx_side_chat_messages_edited_at ON side_chat_messages (edited_at);
CREATE INDEX idx_side_chat_messages_deleted_at ON side_chat_messages (deleted_at);

-- 9. user_side_chat_state
CREATE TABLE user_side_chat_state (
    conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    last_read_seq integer NOT NULL DEFAULT 0,
    CONSTRAINT pk_user_side_chat_state PRIMARY KEY (conversation_id, user_id)
);

-- 10. billing_customers
CREATE TABLE billing_customers (
    user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    provider text NOT NULL DEFAULT 'stripe',
    provider_customer_id text NOT NULL,
    email text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_billing_customers_provider_customer UNIQUE (provider, provider_customer_id)
);
CREATE INDEX idx_billing_customers_email ON billing_customers (email);

-- 11. subscriptions
CREATE TABLE subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_subscription_id text NOT NULL,
    plan_code text NOT NULL,
    status text NOT NULL,
    billing_state text NOT NULL,
    current_period_start timestamptz NOT NULL,
    current_period_end timestamptz NOT NULL,
    cancel_at_period_end boolean NOT NULL,
    canceled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_subscriptions_provider_sub UNIQUE (provider, provider_subscription_id)
);
CREATE INDEX idx_subscriptions_user_id ON subscriptions (user_id);

-- 12. processed_billing_events
CREATE TABLE processed_billing_events (
    provider text NOT NULL,
    event_id text NOT NULL,
    event_type text NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_processed_billing_events PRIMARY KEY (provider, event_id)
);

-- 13. usage_monthly
CREATE TABLE usage_monthly (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    month_key text NOT NULL,
    messages_sent integer NOT NULL DEFAULT 0,
    branches_created integer NOT NULL DEFAULT 0,
    assistant_generations integer NOT NULL DEFAULT 0,
    tokens_input integer NOT NULL DEFAULT 0,
    tokens_output integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_usage_monthly PRIMARY KEY (user_id, month_key),
    CONSTRAINT ck_usage_monthly_month_key CHECK (month_key ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

-- 14. usage_events
CREATE TABLE usage_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    conversation_id uuid REFERENCES conversations (id) ON DELETE SET NULL,
    event_id uuid REFERENCES events (id) ON DELETE SET NULL,
    metric_code text NOT NULL,
    quantity integer NOT NULL,
    unit text NOT NULL,
    metadata_json jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_usage_events_metric_code CHECK (
        metric_code IN (
            'messages_sent',
            'branches_created',
            'assistant_generations',
            'tokens_input',
            'tokens_output'
        )
    )
);
CREATE INDEX idx_usage_events_user_id ON usage_events (user_id);
CREATE INDEX idx_usage_events_conversation_id ON usage_events (conversation_id);
CREATE INDEX idx_usage_events_event_id ON usage_events (event_id);
CREATE INDEX idx_usage_events_created_at ON usage_events (created_at);
```

---

## Cross-table rules

1. **`conversation_user_state.active_event_id`** must reference an **`events.id`** whose **`events.conversation_id`** equals **`conversation_user_state.conversation_id`** (enforce in application or trigger).

2. **Exactly one owner:** **`uq_conversation_single_owner`** guarantees at most one **`owner`** row per conversation; **`POST /api/v1/conversations`** **MUST** insert the creator as **`owner`** in the same transaction as the conversation row ([permissions.md](permissions.md)).
