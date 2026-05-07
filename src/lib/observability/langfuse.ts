/**
 * Langfuse LLM observability for iCareerOS API routes.
 *
 * Zero-dependency path: if env vars are absent, returns a plain Anthropic client.
 * Configured path:      wraps messages.create() with a Langfuse trace + generation.
 *
 * Usage — ONE line change per route:
 *   // Before:
 *   const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
 *   // After:
 *   const anthropic = createTracedClient(user.id, "career-os/coach");
 *   // The rest of the route code is unchanged.
 *
 * Required Vercel env vars (add when ready — Langfuse cloud or self-hosted):
 *   LANGFUSE_PUBLIC_KEY   — from cloud.langfuse.com → Settings → API Keys
 *   LANGFUSE_SECRET_KEY   — same location
 *   LANGFUSE_BASE_URL     — optional, defaults to https://cloud.langfuse.com
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Langfuse } from "langfuse";

// ── Singleton Langfuse instance ───────────────────────────────────────────────

let _lf: Langfuse | null = null;

function getLangfuse(): Langfuse | null {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) return null;
  if (_lf) return _lf;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Langfuse: LangfuseClass } = require("langfuse") as typeof import("langfuse");
  _lf = new LangfuseClass({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com",
    flushAt: 1,
    flushInterval: 0,
  });
  return _lf;
}

// ── Traced client factory ─────────────────────────────────────────────────────

/**
 * Returns an Anthropic client whose messages.create() is wrapped with Langfuse
 * tracing. If Langfuse is not configured, returns a plain Anthropic client.
 *
 * @param userId    - Supabase user ID (for per-user analytics in Langfuse)
 * @param routeName - Human-readable route identifier, e.g. "career-os/coach"
 */
export function createTracedClient(userId: string, routeName: string): Anthropic {
  const base = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const lf = getLangfuse();
  if (!lf) return base; // no-op when Langfuse not configured

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalCreate = base.messages.create.bind(base.messages) as (...args: any[]) => any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tracedCreate = async (...args: any[]) => {
    const [params] = args as [Anthropic.MessageCreateParamsNonStreaming];
    const trace = lf.trace({ name: routeName, userId });
    const generation = trace.generation({
      name: `${routeName}/generation`,
      model: params.model,
      input: JSON.stringify(params.messages ?? params.system ?? ""),
      startTime: new Date(),
    });

    const startMs = Date.now();
    try {
      const result = await originalCreate(...args);
      generation.end({
        output: result?.content?.[0]?.text ?? JSON.stringify(result),
        usage: {
          input:  result?.usage?.input_tokens  ?? 0,
          output: result?.usage?.output_tokens ?? 0,
        },
      });
      trace.update({ metadata: { durationMs: Date.now() - startMs } });
      void lf.flushAsync().catch(() => {});
      return result;
    } catch (err) {
      generation.end({ output: String(err), level: "ERROR" });
      void lf.flushAsync().catch(() => {});
      throw err;
    }
  };

  // Patch messages.create in place — avoids Proxy cast issues
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (base.messages as any).create = tracedCreate;

  return base;
}

/** Type alias for convenience */
export type TracedAnthropicClient = Anthropic;


// ── Streaming-route trace helper ──────────────────────────────────────────────
//
// createTracedClient only patches the non-streaming `messages.create` because
// the SDK's `messages.stream()` returns an async iterable, not a Promise. For
// streaming routes (Coach Mode B, Interview Simulator) we record token/cost
// metadata via this small helper after the stream completes.
//
// Phase 5 Item 3 — see docs/specs/COWORK-BRIEF-phase5-v1.md.

export interface CoachSessionTraceMetadata {
  session_id:           string;
  turn_input_tokens:    number;
  turn_output_tokens:   number;
  turn_cost_usd:        number;
  total_input_tokens:   number;
  total_output_tokens:  number;
  cumulative_cost_usd:  number;
  message_count:        number;
}

/**
 * Record token + cost metadata for a streamed turn against a Langfuse trace.
 * No-op when Langfuse env vars are unset (mirrors createTracedClient).
 * Best-effort — never throws on telemetry failure.
 */
export async function recordCoachSessionTrace(
  userId:    string,
  routeName: string,
  metadata:  CoachSessionTraceMetadata,
): Promise<void> {
  const lf = getLangfuse();
  if (!lf) return;
  try {
    const trace = lf.trace({ name: routeName, userId });
    trace.update({ metadata });
    await lf.flushAsync().catch(() => {});
  } catch {
    /* best-effort */
  }
}
