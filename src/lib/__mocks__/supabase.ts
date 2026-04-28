/**
 * iCareerOS — Supabase Test Mock
 *
 * Provides a fully typed vi.mock-compatible mock of the Supabase client.
 * Import this in tests via vi.mock("@/lib/supabase").
 *
 * Usage in tests:
 *   import { mockSupabase } from "@/lib/__mocks__/supabase";
 *   mockSupabase.from.mockReturnValue({ select: ..., insert: ..., ... });
 *
 * The default export satisfies the createClient() call signature.
 */

import { vi } from "vitest";

// ── Query builder chain mock ───────────────────────────────────────────────

export const makeQueryBuilder = (defaultReturn: unknown = { data: null, error: null }) => {
  const chain: Record<string, unknown> = {};

  const chainMethods = [
    "select", "insert", "update", "upsert", "delete",
    "eq", "neq", "gt", "gte", "lt", "lte",
    "in", "is", "not", "or", "and",
    "order", "limit", "range", "offset",
    "filter", "match",
  ];

  for (const method of chainMethods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }

  // Terminal methods resolve
  chain.single      = vi.fn().mockResolvedValue(defaultReturn);
  chain.maybeSingle = vi.fn().mockResolvedValue(defaultReturn);

  // Make the chain itself awaitable
  (chain as any).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(defaultReturn).then(resolve);

  return chain;
};

// ── Functions mock ────────────────────────────────────────────────────────

export const mockFunctions = {
  invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
};

// ── Auth mock ──────────────────────────────────────────────────────────────

export const mockAuth = {
  getUser:            vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  getSession:         vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
  signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
  signUp:             vi.fn().mockResolvedValue({ data: null, error: null }),
  signOut:            vi.fn().mockResolvedValue({ error: null }),
  onAuthStateChange:  vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
};

// ── RPC mock ───────────────────────────────────────────────────────────────

export const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });

// ── Main mock client ───────────────────────────────────────────────────────

export const mockSupabase = {
  from:      vi.fn().mockReturnValue(makeQueryBuilder()),
  functions: mockFunctions,
  auth:      mockAuth,
  rpc:       mockRpc,
};

/**
 * Reset all mocks to default state AND clear call history.
 * Call in beforeEach to keep tests fully isolated.
 */
export function resetSupabaseMocks() {
  // Clear call history
  mockSupabase.from.mockClear();
  mockFunctions.invoke.mockClear();
  mockRpc.mockClear();
  Object.values(mockAuth).forEach((fn) => {
    if (typeof fn === "function" && "mockClear" in fn) (fn as ReturnType<typeof vi.fn>).mockClear();
  });

  // Reset return values
  mockSupabase.from.mockReturnValue(makeQueryBuilder());
  mockFunctions.invoke.mockResolvedValue({ data: null, error: null });
  mockAuth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mockRpc.mockResolvedValue({ data: null, error: null });
}

/**
 * Helper: make `from(table).select().eq()...` resolve with specific data.
 */
export function mockFromResult(data: unknown, error: unknown = null) {
  const qb = makeQueryBuilder({ data, error });
  mockSupabase.from.mockReturnValue(qb);
  return qb;
}

/**
 * Helper: make functions.invoke resolve with specific data.
 */
export function mockInvokeResult(data: unknown, error: unknown = null) {
  mockFunctions.invoke.mockResolvedValue({ data, error });
}

// ── createClient mock ──────────────────────────────────────────────────────

export const createClient = vi.fn(() => mockSupabase);

export default { createClient };
