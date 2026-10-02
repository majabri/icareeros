"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";

interface CreateInviteResult {
  success: boolean;
  invite_code?: string;
  error?: string;
  resets_at?: string;
}

/**
 * Invite-only enrollment (2026-10-01) — replaces the old fake `?ref=`
 * referral-link stub. iCareerOS doesn't currently accept public signups
 * (see enforce_invite_only_signup() trigger); this is how an existing
 * user actually produces a code someone else can use to join. Calls the
 * create_invite_code() RPC, which enforces the same 5/day cap the legacy
 * referral design already had.
 */
export function ReferralSection() {
  const [code, setCode]       = useState("");
  const [link, setLink]       = useState("");
  const [copied, setCopied]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await createClient().rpc("create_invite_code");
      if (rpcError) throw rpcError;

      const result = data as CreateInviteResult;
      if (!result.success) {
        setError(
          result.error === "daily_limit_reached"
            ? "You've hit the 5-invite daily limit. Try again tomorrow."
            : "Couldn't generate an invite code. Please try again.",
        );
        return;
      }

      const rootUrl = process.env.NEXT_PUBLIC_ROOT_URL ?? window.location.origin;
      setCode(result.invite_code ?? "");
      setLink(`${rootUrl}/auth/signup?invite=${result.invite_code}`);
    } catch {
      setError("Couldn't generate an invite code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-1">Invite a friend</h3>
      <p className="text-sm text-gray-500 mb-4">
        iCareerOS is invite-only right now. Generate a code for someone to join with —
        up to 5 per day.
      </p>

      {!link ? (
        <button
          type="button"
          onClick={() => void generate()}
          disabled={loading}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white
                     shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50
                     transition-colors"
        >
          {loading ? "Generating…" : "Generate invite code"}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2 max-w-lg">
            <input
              readOnly
              value={link}
              className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700 focus:outline-none"
            />
            <button
              onClick={copy}
              className="shrink-0 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Code: <span className="font-mono font-semibold text-gray-600">{code}</span> — expires in 7 days.
          </p>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
