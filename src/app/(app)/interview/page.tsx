"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import {
  InterviewMessage,
  sendInterviewMessage,
  createInterviewSession,
  updateInterviewSession,
  extractReadinessScore,
} from "@/services/ai/interviewService";

type Phase = "setup" | "active" | "complete";

/** Hidden prompt that triggers Claude to ask the first question. */
const INIT_PROMPT = "Please start the interview. Ask me your first question.";

/** Render **bold** markers in AI feedback text. */
function renderMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function MessageBubble({ msg }: { msg: InterviewMessage }) {
  const isAI = msg.role === "assistant";
  return (
    <div className={`flex ${isAI ? "justify-start" : "justify-end"} mb-4`}>
      <div
        className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words
          ${isAI
            ? "bg-white border border-gray-200 shadow-sm text-gray-800"
            : "bg-blue-600 text-white"
          }`}
      >
        {isAI ? renderMarkdown(msg.content) : msg.content}
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 75 ? "text-green-600" : score >= 50 ? "text-yellow-600" : "text-red-600";
  const bg =
    score >= 75 ? "bg-green-50 border-green-200" : score >= 50 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200";
  return (
    <div className={`inline-flex flex-col items-center rounded-2xl border px-8 py-4 ${bg}`}>
      <span className={`text-5xl font-bold ${color}`}>{score}%</span>
      <span className="text-xs text-gray-500 mt-1">Overall Readiness</span>
    </div>
  );
}

export default function InterviewPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  // messages[0] is the hidden init prompt — always present when phase !== "setup"
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [readinessScore, setReadinessScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function startInterview() {
    if (!jobTitle.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const id = await createInterviewSession(jobTitle.trim());
      setSessionId(id);

      const initMessages: InterviewMessage[] = [
        { role: "user", content: INIT_PROMPT },
      ];

      const reply = await sendInterviewMessage({
        messages: initMessages,
        jobTitle: jobTitle.trim(),
        jobDescription: jobDescription.trim() || undefined,
      });

      const all: InterviewMessage[] = [
        ...initMessages,
        { role: "assistant", content: reply },
      ];
      setMessages(all);
      await updateInterviewSession(id, all);
      setPhase("active");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start interview");
    } finally {
      setLoading(false);
    }
  }

  async function sendAnswer() {
    const answer = userInput.trim();
    if (!answer || loading || !sessionId) return;
    setUserInput("");
    setLoading(true);
    setError(null);

    const withAnswer: InterviewMessage[] = [
      ...messages,
      { role: "user", content: answer },
    ];
    setMessages(withAnswer);

    try {
      const reply = await sendInterviewMessage({
        messages: withAnswer,
        jobTitle,
        jobDescription: jobDescription || undefined,
      });

      const all: InterviewMessage[] = [
        ...withAnswer,
        { role: "assistant", content: reply },
      ];
      setMessages(all);

      const score = extractReadinessScore(reply);
      if (score !== null) {
        setReadinessScore(score);
        await updateInterviewSession(sessionId, all, score);
        setPhase("complete");
      } else {
        await updateInterviewSession(sessionId, all);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send answer");
      // Revert user message on error
      setMessages((prev) => prev.slice(0, -1));
      setUserInput(answer);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendAnswer();
    }
  }

  function resetInterview() {
    setPhase("setup");
    setMessages([]);
    setUserInput("");
    setSessionId(null);
    setReadinessScore(null);
    setError(null);
    setJobTitle("");
    setJobDescription("");
  }

  // Skip the hidden init prompt (index 0) in the display
  const displayMessages = messages.slice(1);
  const answersGiven = displayMessages.filter((m) => m.role === "user").length;

  // ── Setup ─────────────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-16 px-4 pb-16">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="mb-7 text-center">
              <div className="text-4xl mb-3">🎤</div>
              <h1 className="text-2xl font-bold text-gray-900">Interview Simulator</h1>
              <p className="text-gray-500 text-sm mt-2">
                Practice with an AI interviewer and get instant feedback after every answer.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Job Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void startInterview()}
                  placeholder="e.g. Senior Product Manager"
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Job Description{" "}
                  <span className="text-gray-400 font-normal">(optional — for tailored questions)</span>
                </label>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the job description here…"
                  rows={5}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                onClick={() => void startInterview()}
                disabled={!jobTitle.trim() || loading}
                className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Starting interview…" : "Start Interview →"}
              </button>
            </div>

            <div className="mt-5 flex items-center justify-center gap-5 text-xs text-gray-400">
              <span>🎯 5–6 questions</span>
              <span>📊 Readiness score</span>
              <span>💡 Instant feedback</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Complete ───────────────────────────────────────────────────────────────
  if (phase === "complete") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-12 px-4 pb-16">
        <div className="w-full max-w-2xl space-y-6">
          {/* Score card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="text-4xl mb-4">🏆</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-5">Interview Complete!</h2>
            {readinessScore !== null && <ScoreBadge score={readinessScore} />}
            <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={resetInterview}
                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                Practice Another Role
              </button>
              <a
                href="/dashboard"
                className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors text-center"
              >
                Back to Dashboard
              </a>
            </div>
          </div>

          {/* Full transcript */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Full Transcript</h3>
            <div className="space-y-2">
              {displayMessages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Active interview ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 65px)" }}>
      {/* Header bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={resetInterview}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← Back
        </button>
        <div className="h-4 w-px bg-gray-200" />
        <div>
          <p className="text-sm font-semibold text-gray-900 leading-tight">{jobTitle}</p>
          <p className="text-xs text-gray-400">
            {answersGiven} answer{answersGiven !== 1 ? "s" : ""} given · aim for 5–6
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="max-w-2xl mx-auto">
          {displayMessages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex justify-start mb-4">
              <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
                <div className="flex gap-1 items-center">
                  <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4 max-w-[82%]">
              {error}
            </p>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 shrink-0">
        <div className="max-w-2xl mx-auto flex gap-3 items-end">
          <textarea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer… (Enter to send, Shift+Enter for newline)"
            rows={3}
            disabled={loading}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-gray-50 transition-colors"
          />
          <button
            onClick={() => void sendAnswer()}
            disabled={!userInput.trim() || loading}
            className="rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-stretch"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
