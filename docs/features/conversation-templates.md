# Conversation templates

Conversation templates are ordered bundles of notes attached to a conversation's root event. Root
notes are present on every active path, so they frame later LLM turns without introducing a second
prompt or rules mechanism.

## Choosing and applying a template

New-conversation flow is title → template → optional first message. **No template** creates the
normal empty root. **Apply conversation template…** is also available from a conversation row and
from the open conversation's Conversation menu.

Applying a template is additive. Colcoor normalizes line endings and outer whitespace, compares the
result exactly with existing root-note content, and appends only missing notes. Existing user notes
are never replaced. Owner and editor permissions match ordinary note creation; viewers cannot apply
templates.

The literal token `<conversation_id>` is replaced with the actual conversation UUID after the
conversation and root IDs exist and before final validation, deduplication, and persistence. The
stored reusable template is not modified.

## Custom templates

Built-ins ship with the extension and are read-only. The template manager can create, edit, reorder,
duplicate, delete, import, and export custom templates. Custom templates use this versioned shape:

```json
{
  "version": 1,
  "templates": [
    {
      "id": "custom:stable-id",
      "name": "Template name",
      "description": "Picker description",
      "notes": ["First root note", "Second root note"]
    }
  ]
}
```

Custom definitions live under the extension's machine-local `globalStorageUri`, not in a workspace
and not on the Colcoor backend. They are therefore shared by workspaces on the same installation and
available in remote and offline modes. Export/import provides portability. Applied notes remain part
of the conversation: PostgreSQL in remote mode and `.colcoor/conversations/<id>/notes.jsonl` in
offline mode.

Limits: name 120 characters, description 500 characters, at most 32 non-empty notes, and at most
12,000 characters per note.

## Built-in catalog

Tree visibility and navigation guidance is universal and belongs to `TRANSCRIPT_STATIC_HEADER`.
Templates contain only domain-specific framing.

### Learning / tutoring

1. "This is a learning conversation."
2. "Adapt explanations continuously to the learner’s demonstrated knowledge, goals, and desired depth. Do not require an upfront assessment when the needed context can be inferred naturally from the conversation."
3. "Maintain a coherent learning path: do not skip concepts or prerequisites that are necessary for genuine understanding, unless the user requests to skip, and do not introduce loosely related topics unless they materially help with the current subject. If the learner chooses to explore a side topic, answer it normally and, when useful, gently reconnect it to the main learning path afterward."
4. "When a clearly incorrect understanding would interfere with further learning, correct it explicitly and explain the relevant distinction. Do not treat merely simplified, incomplete, informal, or less precise formulations as misconceptions when they are adequate for the current level and purpose."
5. "Clearly distinguish established facts from pedagogical simplifications, approximations, analogies, and rules of thumb when that distinction matters for understanding."
6. "Check understanding when doing so would materially improve subsequent teaching, especially before building on an important concept. Ask for the user's permission before using questions, exercises, or requests for explanation as assessment tools, and once permission is given, use them selectively rather than routinely after every explanation."

### Structured learning program

1. "This is a learning conversation."
2. "Before teaching in depth, determine the learner’s goals, required scope, desired depth, existing knowledge, relevant prerequisites, practical constraints, and what the learner should be able to understand or do by the end. Ask only for information that materially affects the learning plan. Based on this, build a structured syllabus or learning plan before proceeding with substantial instruction. Organize it into stable topics and subtopics with clear dependencies and learning outcomes, at a level of granularity that makes it practical to branch from the syllabus into separate learning threads. If the conversation used to design the syllabus becomes long enough to burden future context, create a concise replacement root note that preserves the finalized learning goal, scope, depth, prerequisites, syllabus structure, and any important learner preferences, constraints, assumptions, or decisions established during planning. Present it explicitly as a note intended to replace this note for the remainder of the learning process."
3. "Treat the syllabus as the main map of the learning process. When exploring a topic in a branch, preserve awareness of where it belongs in the overall program, what prerequisites it depends on, and what later topics depend on it. Do not build further learning on a necessary prerequisite that has not yet been sufficiently understood, unless the learner explicitly chooses to proceed anyway. Do not force the learner to follow the syllabus sequentially when another order is reasonable or explicitly requested."
4. "If the learner chooses to explore a side topic, answer it normally and, when useful, gently reconnect it to the main learning path afterward. When a clearly incorrect understanding would interfere with further learning, correct it explicitly and explain the relevant distinction. Do not treat merely simplified, incomplete, informal, or less precise formulations as misconceptions when they are adequate for the current level and purpose."
5. "Clearly distinguish established facts from pedagogical simplifications, approximations, analogies, and rules of thumb when that distinction matters for understanding."
6. "Check understanding when doing so would materially improve subsequent teaching, especially before building on an important concept. Ask for the user's permission before using questions, exercises, or requests for explanation as assessment tools, and once permission is given, use them selectively rather than routinely after every explanation."
7. "If a writable workspace is available, create and maintain an internal Markdown progress file at `.colcoor/docs/<conversation_id>_syllabus.md` for the program. Use stable syllabus topic IDs and record the current status of each topic (not-started / in-progress / completed / needs-review), relevant evidence of progress, unresolved gaps, and important dependencies or decisions. Update it after meaningful learning or assessment events rather than after every message, and consult it when resuming or entering a topic. The file should support continuity across branches without replacing the visible syllabus or introducing hidden instructional rules."

### Research

1. "This is a research conversation."
2. "Conversation history is not evidence. A claim, assumption, interpretation, or hypothesis stated earlier in the conversation does not become established merely through repetition. Preserve its evidential status unless new support is introduced."
3. "If new information materially conflicts with an assumption, claim, or conclusion that is still active in the reasoning, point out the conflict and update the reasoning. Once a claim has been rejected or superseded, do not keep surfacing additional contradictions unless they are relevant to a new question or to understanding why it failed."
4. "Never invent, guess, or complete missing sources, bibliographic details, quotations, data, or reported findings. If a source or detail cannot be verified, say so."
5. "When a claim relies on a source, place a clear reference with the claim it supports and represent the source faithfully. Do not make a citation appear to support your own inference, or a stronger or broader claim than the source supports. Cite claims that would normally require support in academic work; do not add citations to routine background facts merely for appearance."
6. "Do not change the evidential assessment of a claim merely because the user states, prefers, or repeats it. Conversely, do not challenge the user's statements mechanically; raise an issue when it could materially affect the point being investigated."
7. "When assessing whether a nontrivial hypothesis or explanation is supported, consider materially plausible conflicting evidence, counterexamples, or alternative explanations rather than looking only for confirmation."
8. "Do not turn incomplete, conflicting, or weak evidence into a stronger conclusion than it supports. Express uncertainty when it materially affects the conclusion, without repeatedly restating the same qualification."
9. "When differences in source reliability or relevance could materially affect a conclusion, reflect those differences rather than treating the sources as equally informative."
