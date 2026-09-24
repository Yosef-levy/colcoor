# Structured vs. linear conversation: linear algebra

The same proof-based linear algebra learning program was conducted twice:

1. once using a conventional linear conversation; and
2. once using Colcoor's branching conversation structure.

Both runs used the same model, predefined syllabus, generation settings, and corresponding learning tasks. Where applicable, corresponding calls used seed `1001` and temperature `0` to reduce run-to-run variation. These controls do not make model generation perfectly deterministic.

## Results

| Metric                       | Colcoor tree | Linear conversation |
| ---------------------------- | -----------: | ------------------: |
| Model responses              |          104 |                  81 |
| Cumulative context tokens    |      422,195 |           4,248,190 |
| Average context per response |        4,060 |              52,447 |

The tree-structured run used **90.1% less cumulative conversation context** and **92.3% less context per model response**. Across the 43 user prompts whose text was exactly identical in both runs, it used approximately **92% less context**.

> Near the end of the experiment, equivalent requests sometimes required only **~4–5K context tokens with Colcoor versus more than 100K in the linear conversation**.

These results describe this experiment, not a guaranteed reduction for every conversation. The expected benefit is small for short or nearly linear conversations and grows as an interaction accumulates branches, revisits, and side explorations.

## Method

- The predefined syllabus is embedded in the shared setup at [event `34429763-a079-4da7-b261-abd2ac0dd5be`](colcoor-linear-vs-tree.jsonl#L5).
- The learning program used corresponding tasks but did not produce the same number of model turns: 104 in the Colcoor run and 81 in the linear run.
- Corresponding calls used the same model and generation settings, including seed `1001` and temperature `0` where applicable.
- Context for each response is `tokens.input + tokens.cache_read` in its `colcoor_provider_usage` metadata. These figures measure conversation context made available to the model, not output tokens or total API tokens.
- Cumulative context is the sum of that value across the responses in each run.
- Average context is total context tokens divided by the number of model responses in that run.
- The paired comparison matched the 43 user prompts whose text was exactly identical in both runs.
- Response quality and syllabus coverage were reviewed from the recorded conversation.

The tree run retained each event once and identified its parent. Context for a model call was reconstructed from the selected root-to-event path. The linear run retained one ordered message sequence, so each later call included the preceding conversation.

Late-stage examples from the identical-prompt subset are directly inspectable in the export:

| Request | Colcoor context | Linear context |
| --- | ---: | ---: |
| Why Gram–Schmidt preserves span | [4,851](colcoor-linear-vs-tree.jsonl#L359) | [104,195](colcoor-linear-vs-tree.jsonl#L363) |
| Geometric meaning of `A = QDQ^T` | [4,153](colcoor-linear-vs-tree.jsonl#L367) | [107,191](colcoor-linear-vs-tree.jsonl#L371) |
| Why symmetry implies orthogonal eigenvectors | [4,151](colcoor-linear-vs-tree.jsonl#L369) | [108,677](colcoor-linear-vs-tree.jsonl#L373) |

## Syllabus adherence

Both runs produced mathematically correct responses overall in the review conducted for this comparison. The clearest observable difference was whether the run preserved the predefined syllabus structure.

The recorded graph contains directly inspectable examples:

| Predefined item | Colcoor run | Linear run |
| --- | --- | --- |
| Module 4.1: permutations and the formal determinant definition | [Covered explicitly](colcoor-linear-vs-tree.jsonl#L127) | No corresponding lesson appears |
| Module 4.3: Cramer's Rule | [Covered explicitly](colcoor-linear-vs-tree.jsonl#L135) | Replaced by a lesson labeled [“4.3 Cofactor Expansion”](colcoor-linear-vs-tree.jsonl#L315) |
| Program completion | Progressed through explicit topic branches, including the items above | [Declared the syllabus completed](colcoor-linear-vs-tree.jsonl#L375) despite those omissions |

This supports a narrow conclusion: the Colcoor run adhered more closely to this experiment's predefined learning structure. It does not establish that branching always improves response quality. The mathematical-correctness assessment is a manual review reported with the experiment; the repository does not currently include an independent grading rubric or reviewer report.

## Artifacts

The canonical conversation export is:

- [`colcoor-linear-vs-tree.jsonl`](colcoor-linear-vs-tree.jsonl) — both runs in one Colcoor event graph, including parent identifiers, model settings, and per-response token counts.

The two runs intentionally share their setup and then fork beneath the syllabus response (`34429763-a079-4da7-b261-abd2ac0dd5be`). The conventional linear run begins at event `0488ea68-4403-4a1c-9cfd-da5fdfe94ddc`; the other branches beneath the shared setup form the tree-structured run.

Keeping one canonical graph preserves that shared prefix and the exact experimental topology without duplicating events. Separate `tree.jsonl` and `linear.jsonl` files can be generated later as derived views if a particular analysis tool requires them, but they should not replace this source export.

Keep the event graph and token measurements in Git rather than duplicating the complete assembled prompt for every call. Repeated full prompts can make the linear export unnecessarily large without adding conversation content. If raw provider logs are needed for an independent audit and are too large for normal Git, publish them separately with checksums recorded here.
