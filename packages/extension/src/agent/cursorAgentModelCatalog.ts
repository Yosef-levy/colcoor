/** One Cursor CLI model from `agent models` (`id - label` lines). */
export type CursorAgentModelEntry = {
  id: string;
  label: string;
};

const HEADER_LINE = /^available models$/i;
const UNAVAILABLE_LINE = /^no models available\b/i;

/** Tier suffixes stripped from the end of a model id (longest first). */
const TIER_SUFFIXES = [
  "-thinking-max-fast",
  "-thinking-max",
  "-thinking-xhigh-fast",
  "-thinking-xhigh",
  "-thinking-high-fast",
  "-thinking-high",
  "-thinking-medium-fast",
  "-thinking-medium",
  "-thinking-low-fast",
  "-thinking-low",
  "-extra-high-fast",
  "-extra-high",
  "-xhigh-fast",
  "-xhigh",
  "-medium-fast",
  "-medium",
  "-high-fast",
  "-high",
  "-low-fast",
  "-low",
  "-none-fast",
  "-none",
  "-max-fast",
  "-max",
  "-fast",
  "-thinking",
] as const;

/**
 * Parse stdout from `agent models` / `agent --list-models`.
 * Lines look like `gpt-5.5-medium - GPT-5.5 1M` (see Cursor CLI).
 */
export function parseCursorAgentModelsStdout(stdout: string): CursorAgentModelEntry[] {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }
  if (UNAVAILABLE_LINE.test(trimmed) && !trimmed.includes("\n")) {
    return [];
  }
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return dedupeEntries(
          parsed
            .filter((x): x is string => typeof x === "string")
            .map((id) => ({ id: id.trim(), label: id.trim() }))
            .filter((e) => e.id.length > 0),
        );
      }
    } catch {
      /* fall through */
    }
  }
  const out: CursorAgentModelEntry[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || HEADER_LINE.test(t) || UNAVAILABLE_LINE.test(t)) {
      continue;
    }
    const bullet = t.replace(/^[-*]\s+/, "").trim();
    const dash = bullet.indexOf(" - ");
    if (dash >= 0) {
      const id = bullet.slice(0, dash).trim();
      const label = bullet.slice(dash + 3).trim();
      if (id) {
        out.push({ id, label: label || id });
      }
      continue;
    }
    if (bullet) {
      out.push({ id: bullet, label: bullet });
    }
  }
  return dedupeEntries(out);
}

function dedupeEntries(entries: CursorAgentModelEntry[]): CursorAgentModelEntry[] {
  const seen = new Set<string>();
  const out: CursorAgentModelEntry[] = [];
  for (const e of entries) {
    if (!e.id || seen.has(e.id)) {
      continue;
    }
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

/** Normalized family key with tier suffixes removed (e.g. `gpt-5.3-codex-high` → `gpt-5.3-codex`). */
export function modelFamilyKey(modelId: string): string {
  let k = modelId.trim();
  if (!k) {
    return k;
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const sfx of TIER_SUFFIXES) {
      if (k.endsWith(sfx)) {
        k = k.slice(0, -sfx.length);
        changed = true;
        break;
      }
    }
  }
  return k;
}

/** Higher = better match for “medium” tier within a family. */
export function mediumTierScore(modelId: string, familyKey: string): number | null {
  if (!modelId || modelId === "auto") {
    return null;
  }
  if (modelId.includes("-medium") && !modelId.endsWith("-medium-fast")) {
    return 100;
  }
  if (modelId === familyKey) {
    return 80;
  }
  return null;
}

export type ModelProductKey = {
  product: string;
  version: number[];
};

/** Groups families so only the latest version per product line is kept in the curated list. */
export function modelProductKey(familyKey: string): ModelProductKey {
  const composer = /^composer-(\d+(?:\.\d+)?)/.exec(familyKey);
  if (composer) {
    return { product: "composer", version: parseVersionNumbers(composer[1]) };
  }
  const gptCodex = /^gpt-(\d+(?:\.\d+)?)-codex/.exec(familyKey);
  if (gptCodex) {
    return { product: "gpt-codex", version: parseVersionNumbers(gptCodex[1]) };
  }
  const gpt = /^gpt-(\d+(?:\.\d+)?)/.exec(familyKey);
  if (gpt) {
    return { product: "gpt", version: parseVersionNumbers(gpt[1]) };
  }
  const claude = /^claude-(\d+(?:\.\d+)?)-([a-z0-9-]+)/.exec(familyKey);
  if (claude) {
    return { product: `claude-${claude[2]}`, version: parseVersionNumbers(claude[1]) };
  }
  const grok = /^grok-(\d+(?:\.\d+)?)/.exec(familyKey);
  if (grok) {
    return { product: "grok", version: parseVersionNumbers(grok[1]) };
  }
  return { product: familyKey, version: [0] };
}

function parseVersionNumbers(raw: string): number[] {
  return raw.split(".").map((p) => Number.parseInt(p, 10)).filter((n) => Number.isFinite(n));
}

export function compareVersion(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) {
      return d;
    }
  }
  return 0;
}

/**
 * Short list for the composer: latest “medium” (or base) per product line.
 * `auto` is excluded — use Auto in the UI instead.
 */
export function curateAgentModelsForComposer(entries: CursorAgentModelEntry[]): CursorAgentModelEntry[] {
  const byFamily = new Map<string, CursorAgentModelEntry[]>();
  for (const e of entries) {
    if (e.id === "auto") {
      continue;
    }
    const fk = modelFamilyKey(e.id);
    const group = byFamily.get(fk) ?? [];
    group.push(e);
    byFamily.set(fk, group);
  }

  const mediumByFamily: CursorAgentModelEntry[] = [];
  for (const [fk, group] of byFamily) {
    let best: CursorAgentModelEntry | null = null;
    let bestScore = -1;
    for (const e of group) {
      const score = mediumTierScore(e.id, fk);
      if (score != null && score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best) {
      mediumByFamily.push(best);
    }
  }

  const byProduct = new Map<string, CursorAgentModelEntry>();
  for (const e of mediumByFamily) {
    const fk = modelFamilyKey(e.id);
    const pk = modelProductKey(fk);
    const key = pk.product;
    const existing = byProduct.get(key);
    if (!existing) {
      byProduct.set(key, e);
      continue;
    }
    const existingFk = modelFamilyKey(existing.id);
    const existingPk = modelProductKey(existingFk);
    if (compareVersion(pk.version, existingPk.version) > 0) {
      byProduct.set(key, e);
    }
  }

  return [...byProduct.values()].sort((a, b) => a.label.localeCompare(b.label));
}
