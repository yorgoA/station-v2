/** Levenshtein edit distance between two strings. */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prevRow = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const currRow = [i];
    for (let j = 1; j <= n; j++) {
      currRow[j] =
        a[i - 1] === b[j - 1]
          ? prevRow[j - 1]
          : 1 + Math.min(prevRow[j - 1], prevRow[j], currRow[j - 1]);
    }
    prevRow = currRow;
  }
  return prevRow[n];
}

/** 0 (nothing alike) to 1 (identical), case/whitespace-insensitive. */
export function stringSimilarity(a: string, b: string): number {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  const distance = levenshteinDistance(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  return 1 - distance / maxLen;
}

export type SimilarMatch = { value: string; score: number };

/**
 * Finds existing values close enough to `value` to plausibly be the same
 * thing mistyped (e.g. "Tony" vs "Toni") -- excludes exact matches, since
 * those aren't a typo risk, just reuse. Sorted best match first.
 */
export function findSimilarValues(value: string, candidates: string[], threshold = 0.6): SimilarMatch[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  return candidates
    .filter((candidate) => candidate.trim().toLowerCase() !== trimmed.toLowerCase())
    .map((candidate) => ({ value: candidate, score: stringSimilarity(trimmed, candidate) }))
    .filter((match) => match.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
