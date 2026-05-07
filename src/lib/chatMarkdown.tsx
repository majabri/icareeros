"use client";

/**
 * Minimal markdown renderer for chat assistant messages.
 *
 * Extracted from the Interview Simulator's inline `renderMarkdown` (Phase 0)
 * so both Coach Mode B and the eventual Interview rebuild can share. Handles
 * `**bold**`, `## heading`, `### subheading`, `- bullets`. No code blocks,
 * no tables — keep it small. If a future surface needs richer markdown, swap
 * to the heavier LegalMarkdown renderer or `react-markdown`.
 */

import type { ReactNode } from "react";

function renderInline(line: string): ReactNode {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}

export function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-gray-800">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("### "))
          return <h4 key={i} className="font-semibold text-gray-900 mt-3">{line.slice(4)}</h4>;
        if (line.startsWith("## "))
          return <h3 key={i} className="font-bold text-gray-900 text-base mt-4 border-b border-gray-200 pb-1">{line.slice(3)}</h3>;
        if (line.startsWith("# "))
          return <h2 key={i} className="font-bold text-gray-900 text-lg mt-4">{line.slice(2)}</h2>;
        if (line.match(/^[-*•]\s/))
          return (
            <p key={i} className="pl-4 relative before:content-['•'] before:absolute before:left-1 before:text-brand-500 mb-1">
              {renderInline(line.slice(2))}
            </p>
          );
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i} className="mb-1">{renderInline(line)}</p>;
      })}
    </div>
  );
}
