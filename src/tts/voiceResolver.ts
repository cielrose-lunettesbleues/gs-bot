export interface TtsVoiceSettings {
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
  speed: number;
}

export interface TtsVoice {
  id: number;
  tenantId: number;
  label: string;
  provider: string;
  voiceId: string;
  isDefault: boolean;
  aliases: string[];
  settings: TtsVoiceSettings;
}

/** Normalize a string for comparison: lowercase, strip accents, strip non-alphanumeric. */
export function normalizeVoiceLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

/**
 * Resolve a user-supplied voice label to a configured voice.
 *
 * Resolution order:
 *   1. Exact match on normalized label
 *   2. Exact match on any normalized alias
 *   3. Fuzzy Levenshtein match (threshold: max(2, 30% of input length))
 *   4. Fallback: first voice with is_default=true, or voices[0]
 *
 * Never throws — always returns a voice if voices is non-empty, null if empty.
 */
export function resolveVoice(input: string, voices: TtsVoice[]): TtsVoice | null {
  if (voices.length === 0) return null;

  const norm = normalizeVoiceLabel(input);

  // Step 1: exact label match
  for (const v of voices) {
    if (normalizeVoiceLabel(v.label) === norm) return v;
  }

  // Step 2: exact alias match
  for (const v of voices) {
    for (const alias of v.aliases) {
      if (normalizeVoiceLabel(alias) === norm) return v;
    }
  }

  // Step 3: fuzzy match across labels + aliases
  const threshold = Math.max(2, Math.floor(norm.length * 0.3));
  let best: TtsVoice | null = null;
  let bestDist = Infinity;

  for (const v of voices) {
    const candidates = [v.label, ...v.aliases].map(normalizeVoiceLabel);
    for (const candidate of candidates) {
      const dist = levenshtein(norm, candidate);
      if (dist < bestDist) {
        bestDist = dist;
        best = v;
      }
    }
  }

  if (best && bestDist <= threshold) return best;

  // Step 4: fallback to default or first
  return voices.find((v) => v.isDefault) ?? voices[0];
}
