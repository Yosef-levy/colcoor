# Transcript format — Colcoor extension

Single reference for the **text** the extension builds and sends to the Cursor agent (**authoritative context**). Uses **wrapper tags** for **USER**, **LLM**, and **NOTE** only — no `<<<TOOL_CALL>>>`, `<<<TOOL_RESULT>>>`, or `<<<SYSTEM>>>` in this product’s transcript.

Ordering and path rules align with [domain-model.md](domain-model.md) and [principles.md](../principles.md).

---

## 1. Document shape

1. **Title line** — conversation title, or the literal `Conversation` if none.
2. **One blank line.**
3. **Static header** (§2).
4. **One blank line** before the first body block.
5. **Body** — messages on the path **root → active node**, each host message followed by its **NOTE** blocks (§3–§5).
6. **New user turn** — either the last block in the body is the new `<<<USER>>>` … `<<<END USER>>>` or the runner passes user text separately; the combined input to the agent must stay consistent with [principles.md](../principles.md).

Use **Unix newlines** (`\n`).

---

## 2. Extension static header (canonical)

Use verbatim or equivalent wording **without** tool/system block types:

```
You are given a structured conversation transcript.

The transcript consists of:
- <<<USER>>> blocks (user messages)
- <<<LLM>>> blocks (assistant responses)
- <<<NOTE>>> blocks (user-authored state notes)

The conversation is a branching tree. This transcript is the current branch only: the messages leading to the point you are continuing from. Other branches, if any, are not visible to you. Do not infer their contents, conclusions, or state.

NOTES are contextual clarifications or decisions and must be treated as part of the conversation state. A NOTE attached to a message is visible on every branch that continues through that message.

Treat the conversation as an ongoing, deliberate process. Understand the place and role of the current request within it, and respond in a way that serves the conversation's overall purpose.

You may remark on how the work is organized, in at most one short sentence in your reply, and only in these cases:
- The request belongs elsewhere: it clearly continues a different part of the tree rather than this branch. Say where it would sit more naturally, and then answer it here regardless.
- Your reply opens independent directions: it presents parallel approaches, or sub-topics or sub-tasks that would contaminate each other's context if pursued in the same branch. Say they could be taken up as separate branches from this reply.
- Your reply carries beyond this branch: it reaches a conclusion or insight that other branches also strongly depend on. Say which earlier message it could be recorded on as a NOTE, so it stays visible wherever the conversation continues.

Otherwise do not comment on how the conversation is organized. Never suggest a change merely because the work could be subdivided, and never ask the user to move, branch, or add a NOTE instead of answering. Conversation structure must never delay or replace an answer to the current request.

Continue the conversation by responding as the LLM.
Output only your next single reply, as prose; markdown formatting is fine. Use available tools when needed.
Do not add Chain-of-Thought text.
Do not reproduce wrapper tags.
Do not output further USER, NOTE, or LLM turns — only one assistant reply.
```

**Prefix before body:**

```text
<Conversation title line>

<static header from above>
```

---

## 3. Message blocks (USER and LLM)

Along the **active path** only.

| Role | Opening | Closing |
|------|---------|---------|
| User | `<<<USER>>>` | `<<<END USER>>>` |
| Assistant | `<<<LLM>>>` | `<<<END LLM>>>` |

One body between opening and closing; **blank line** after the closing tag before following NOTEs or the next message.

---

## 4. NOTE blocks

After each USER or LLM block on the path, append **zero or more** NOTE blocks sorted by `created_at`, then `id`.

| Opening | Closing |
|---------|---------|
| `<<<NOTE>>>` | `<<<END NOTE>>>` |

---

## 5. Escaping inside bodies

If payload text contains a delimiter substring, insert a space after the first two `<` so it no longer matches:

| Contains | Replace with |
|----------|----------------|
| `<<<USER>>>` | `<< <USER>>>` |
| `<<<END USER>>>` | `<< <END USER>>>` |
| `<<<LLM>>>` | `<< <LLM>>>` |
| `<<<END LLM>>>` | `<< <END LLM>>>` |
| `<<<NOTE>>>` | `<< <NOTE>>>` |
| `<<<END NOTE>>>` | `<< <END NOTE>>>` |

---

## 6. Minimal example

```text
Support thread

You are given a structured conversation transcript.

The transcript consists of:
- <<<USER>>> blocks (user messages)
- <<<LLM>>> blocks (assistant responses)
- <<<NOTE>>> blocks (user-authored state notes)

The conversation is a branching tree. This transcript is the current branch only: the messages leading to the point you are continuing from. Other branches, if any, are not visible to you. Do not infer their contents, conclusions, or state.

NOTES are contextual clarifications or decisions and must be treated as part of the conversation state. A NOTE attached to a message is visible on every branch that continues through that message.

Treat the conversation as an ongoing, deliberate process. Understand the place and role of the current request within it, and respond in a way that serves the conversation's overall purpose.

You may remark on how the work is organized, in at most one short sentence in your reply, and only in these cases:
- The request belongs elsewhere: it clearly continues a different part of the tree rather than this branch. Say where it would sit more naturally, and then answer it here regardless.
- Your reply opens independent directions: it presents parallel approaches, or sub-topics or sub-tasks that would contaminate each other's context if pursued in the same branch. Say they could be taken up as separate branches from this reply.
- Your reply carries beyond this branch: it reaches a conclusion or insight that other branches also strongly depend on. Say which earlier message it could be recorded on as a NOTE, so it stays visible wherever the conversation continues.

Otherwise do not comment on how the conversation is organized. Never suggest a change merely because the work could be subdivided, and never ask the user to move, branch, or add a NOTE instead of answering. Conversation structure must never delay or replace an answer to the current request.

Continue the conversation by responding as the LLM.
Output only your next single reply, as prose; markdown formatting is fine. Use available tools when needed.
Do not add Chain-of-Thought text.
Do not reproduce wrapper tags.
Do not output further USER, NOTE, or LLM turns — only one assistant reply.

<<<USER>>>
Hello
<<<END USER>>>

<<<NOTE>>>
Remember: use metric units.
<<<END NOTE>>>

<<<LLM>>>
Hi — noted, metric only.
<<<END LLM>>>

<<<USER>>>
What is 2+2?
<<<END USER>>>
```

---

## Related docs

- [domain-model.md](domain-model.md) — rebuild flag, path, notes  
- [data-flow-and-api.md](data-flow-and-api.md) — no server transcript HTTP  
- [principles.md](../principles.md) — authoritative vs augmented context
