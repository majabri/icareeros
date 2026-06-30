/**
 * Zero-cost semantic similarity for resume / job-description matching.
 *
 * 2026-06-28 — replaces the OpenAI text-embedding-3-small wrapper that
 * shipped in PR #334. Uses TF-IDF weighted term vectors + cosine
 * similarity. No external APIs. No paid services. No vendor dependencies.
 * Fully compatible with the existing embed / cosineSimilarity / cosineToScore
 * contract so call sites (fit-check/route.ts) require no signature changes.
 *
 * Filename is kept as `openai.ts` to avoid an import-path cascade across
 * the codebase. A future rename to `embeddings.ts` is mechanical.
 */

// Common English stop words to exclude from term vectors.
const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "by","from","is","are","was","were","be","been","being","have","has",
  "had","do","does","did","will","would","could","should","may","might",
  "shall","can","need","dare","ought","used","it","its","this","that",
  "these","those","i","we","you","he","she","they","who","which","what",
  "as","if","when","where","while","although","because","since","unless",
  "than","so","yet","both","either","neither","not","no","nor","very",
  "just","more","also","about","into","over","after","before","during",
  "each","few","most","other","some","such","only","own","same",
  "too","s","t","don","now",
]);

/**
 * Tokenize and normalize text into a term → TF map.
 * Returns a Map of term → normalized term frequency (freq / total tokens).
 */
function tokenize(text: string): Map<string, number> {
  const terms = text
    .toLowerCase()
    .replace(/[^a-z0-9\s+#]/g, " ")  // keep # for C#, + for C++
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));

  const freq = new Map<string, number>();
  for (const term of terms) {
    freq.set(term, (freq.get(term) ?? 0) + 1);
  }

  // Normalize to term frequency (TF)
  const total = terms.length || 1;
  for (const [term, count] of freq) {
    freq.set(term, count / total);
  }

  return freq;
}

/**
 * Build a dense vector from a term-frequency map against a shared vocabulary.
 */
function buildVector(tfMap: Map<string, number>, vocab: string[]): number[] {
  return vocab.map(term => tfMap.get(term) ?? 0);
}

/**
 * Cosine similarity between two same-length vectors. Returns null on
 * zero-norm vectors or length mismatch. Result is in [-1, 1]; for TF-IDF
 * vectors in practice usually [0, 0.65].
 */
export function cosineSimilarity(a: number[] | null, b: number[] | null): number | null {
  if (!a || !b || a.length === 0 || a.length !== b.length) return null;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    dot   += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return null;

  return dot / denom;
}

/**
 * Map cosine similarity to a 0..100 score.
 * Calibrated for resume / JD pairs: floor 0.05, ceiling 0.65.
 * Below floor → 0. Above ceiling → 100. Linear in between.
 */
export function cosineToScore(cos: number | null): number | null {
  if (cos === null) return null;
  const FLOOR   = 0.05;
  const CEILING = 0.65;
  if (cos <= FLOOR)   return 0;
  if (cos >= CEILING) return 100;
  return Math.round(((cos - FLOOR) / (CEILING - FLOOR)) * 100);
}

/**
 * "Embed" a document as a fixed-dimension TF-IDF-weighted dense vector.
 *
 * Unlike the OpenAI implementation this is fully synchronous under the
 * hood, but we keep the async signature so call sites that already
 * `await embed(...)` require zero changes.
 *
 * Returns null on empty input (same contract as the OpenAI wrapper).
 *
 * The returned vector is exactly 512-dim — top-512 terms by TF score,
 * padded with zeros when fewer terms are present. This matches the
 * resized `vector(512)` columns on `career_profiles.embedding` and
 * `job_embeddings.embedding` (migration 20260628*_resize_embedding_vectors).
 *
 * NOTE: this vector is suitable for *storage* but NOT for cross-document
 * comparison because each document picks its own top-512 terms and the
 * dimensions are not aligned to a shared vocabulary. For real-time pair
 * comparison, use `compareTexts(a, b)` instead.
 */
export async function embed(text: string): Promise<number[] | null> {
  if (!text?.trim()) return null;

  // Match the OpenAI wrapper's 8000-char truncation
  const truncated = text.slice(0, 8000);
  const tfMap = tokenize(truncated);

  if (tfMap.size === 0) return null;

  const sorted = [...tfMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 512);

  const vector = new Array<number>(512).fill(0);
  sorted.forEach(([, score], i) => {
    vector[i] = score;
  });

  return vector;
}

/**
 * Direct in-memory comparison of two texts.
 *
 * Builds a shared vocabulary across both documents, then runs cosine
 * similarity. This is faster and more accurate than the stored-vector
 * path (`embed` → store → cosineSimilarity) because:
 *   1. No round-trip to the database
 *   2. The vocabulary is the union of both docs (no top-512 truncation
 *      misalignment between resume and JD)
 *
 * Returns null when either input is empty / all stop-words.
 */
export function compareTexts(textA: string, textB: string): number | null {
  if (!textA?.trim() || !textB?.trim()) return null;

  const tfA = tokenize(textA.slice(0, 8000));
  const tfB = tokenize(textB.slice(0, 8000));

  const vocab = [...new Set([...tfA.keys(), ...tfB.keys()])];
  if (vocab.length === 0) return null;

  const vecA = buildVector(tfA, vocab);
  const vecB = buildVector(tfB, vocab);

  return cosineSimilarity(vecA, vecB);
}
