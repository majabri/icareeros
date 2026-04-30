/**
 * GET /api/debug/ai-key — temporary diagnostic, remove after confirming.
 * Returns key presence, length, prefix. Never exposes the full key.
 */
import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.ANTHROPIC_API_KEY;
  return NextResponse.json({
    set: !!key,
    length: key?.length ?? 0,
    prefix: key ? key.slice(0, 14) + "..." : null,
    nodeEnv: process.env.NODE_ENV,
  });
}
