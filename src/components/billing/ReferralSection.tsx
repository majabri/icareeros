"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

export function ReferralSection() {
  const [link, setLink]   = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user?.id) setLink(`https://icareeros.com/?ref=${data.user.id.slice(0, 8)}`);
    });
  }, []);

  function copy() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!link) return null;

  return (
    <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-1">Referral Program</h3>
      <p className="text-sm text-gray-500 mb-4">
        Invite friends — when 3 sign up you unlock Premium features.
      </p>
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
    </div>
  );
}
