/**
 * OpenAI text-embedding-3-small wrapper.
 *
 * 1536-dim — matches the `vector(1536)` columns in `career_profiles.embedding`
 * and `job_embeddings.embedding` (PR #320 / #321 series).
 *
 * Soft-fails when `OPENAI_API_KEY` is missing — returns null instead of
 * throwing. The fit-check pipeline treats a null embedding as "skip
 * semanticScore", so the existing rule-based breakdown still ships.
 */

const OPENAI_MODEL = "text-embedding-3-small";
const OPENAI_URL   = "https://api.openai.com/v1/embeddings";

/**
 * Returns a 1536-dim embedding for the input text, or null if no API key
 * is configured or the call failed. Truncates input at 8000 chars (the
 * model max is 8191 tokens but characters is a safer pre-tokenization cap).
 */
export async function embed(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const input = text.slice(0, 8000);
  if (!input.trim()) return null;

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ model: OPENAI_MODEL, input }),
    });
    if (!res.ok) {
      console.warn(`[embeddings] OpenAI HTTP ${res.status} — returning null`);
      return null;
    }
    const json = await res.json() as { data?: Array<{ embedding?: number[] }> };
    return json.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.warn(`[embeddings] fetch failed: ${(e as Error).message} — returning null`);
    return null;
  }
}

/**
 * Cosine similarity between two same-length vectors. Returns null if
 * either vector is null/empty/length-mismatched. Result is in [-1, 1];
 * for text-embedding-3-small in practice usually positive ~0.0..0.95.
 */
export function cosineSimilarity(a: number[] | null, b: number[] | null): number | null {
  if (!a || !b || a.length === 0 || a.length !== b.length) return null;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i], bi = b[i];
    dot += ai * bi;
    na  += ai * ai;
    nb  += bi * bi;
  }
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Map cosine similarity (-1..1) → 0..100 score. For text-embedding-3-small
 * the realistic floor for a job seeker / JD pair is ~0.3 (nothing in common)
 * and the ceiling is ~0.85 (perfect alignment), so we rescale that range
 * to make the 0-100 number readable by humans.
 */
export function cosineToScore(cos: number | null): number | null {
  if (cos === null) return null;
  // Linearly map [0.30, 0.85] → [0, 100], clamp outside
  const lo = 0.30, hi = 0.85;
  const t = (cos - lo) / (hi - lo);
  return Math.round(Math.max(0, Math.min(1, t)) * 100);
}
