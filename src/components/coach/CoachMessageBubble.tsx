"use client";

import type { CoachMessage } from "@/services/ai/coachSessionService";
import { ChatMarkdown } from "@/lib/chatMarkdown";

export function CoachMessageBubble({ msg, streaming }: { msg: CoachMessage; streaming?: boolean }) {
  const isAi = msg.role === "assistant";
  return (
    <div className={`flex ${isAi ? "justify-start" : "justify-end"} mb-4`}>
      <div
        className={`max-w-[82%] rounded-2xl px-4 py-3 leading-relaxed whitespace-pre-wrap break-words
          ${isAi
            ? "bg-white border border-gray-200 shadow-sm text-gray-800"
            : "bg-brand-600 text-white"
          }`}
        data-testid={isAi ? "coach-bubble-assistant" : "coach-bubble-user"}
      >
        {isAi
          ? <><ChatMarkdown text={msg.content} />{streaming && <span className="ml-1 inline-block animate-pulse">▍</span>}</>
          : <span className="text-sm">{msg.content}</span>}
      </div>
    </div>
  );
}
