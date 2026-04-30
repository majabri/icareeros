"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import {
  InterviewMessage,
  InterviewSession,
  sendInterviewMessage,
  generateInterviewPrep,
  createInterviewSession,
  updateInterviewSession,
  listInterviewSessions,
  extractReadinessScore,
  parseFinalFeedback,
} from "@/services/ai/interviewService";

type Phase = "setup" | "prep" | "active" | "complete";

const INIT_PROMPT = "Please start the interview. Ask me your first question.";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

/** Render markdown prep guide — handles ## headers and bullet lines. */
function PrepContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none text-gray-700">
      {content.split("\n").map((line, i) => {
        if (line.startsWith("### "))
          return <h4 key={i} className="font-semibold text-gray-800 mt-4 mb-1">{line.slice(4)}</h4>;
        if (line.startsWith("## "))
          return <h3 key={i} className="font-bold text-gray-900 text-base mt-6 mb-2 border-b border-gray-200 pb-1">{line.slice(3)}</h3>;
        if (line.startsWith("# "))
          return <h2 key={i} className="font-bold text-gray-900 text-lg mt-6 mb-2">{line.slice(2)}</h2>;
        if (line.match(/^[-*•]\s/))
          return <p key={i} className="pl-4 relative before:content-['•'] before:absolute before:left-1 before:text-blue-500 text-sm mb-1">{line.slice(2)}</p>;
        if (line.trim() === "") return <div key={i} className="h-2" />;
        return <p key={i} className="text-sm mb-1">{renderMarkdown(line)}</p>;
      })}
    </div>
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
  const color = score >= 75 ? "text-green-600" : score >= 50 ? "text-yellow-600" : "text-red-600";
  const bg = score >= 75 ? "bg-green-50 border-green-200" : score >= 50 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200";
  return (
    <div className={`inline-flex flex-col items-center rounded-2xl border px-8 py-4 ${bg}`}>
      <span className={`text-5xl font-bold ${color}`}>{score}%</span>
      <span className="text-xs text-gray-500 mt-1">Overall Readiness</span>
    </div>
  );
}

function SessionHistoryItem({
  session,
  onSelect,
}: {
  session: InterviewSession;
  onSelect: (s: InterviewSession) => void;
}) {
  const score = session.readiness_score;
  const scoreColor = score === null ? "text-gray-400" : score >= 75 ? "text-green-600" : score >= 50 ? "text-yellow-600" : "text-red-600";
  const date = new Date(session.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return (
    <button
      onClick={() => onSelect(session)}
      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left transition-colors group"
    >
      <div>
        <p className="text-sm font-medium text-gray-800 group-hover:text-blue-700 transition-colors">
          {session.job_title}
        </p>
        <p className="text-xs text-gray-400">{date}</p>
      </div>
      <span className={`text-sm font-bold ${scoreColor}`}>
        {score !== null ? `${score}%` : "—"}
      </span>
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InterviewPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resume, setResume] = useState("");
  const [showResumeField, setShowResumeField] = useState(false);

  // messages[0] is the hidden init prompt
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [prepContent, setPrepContent] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [readinessScore, setReadinessScore] = useState<number | null>(null);
  const [finalMessage, setFinalMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<InterviewSession[]>([]);
  const [historySession, setHistorySession] = useState<InterviewSession | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load session history once on mount
  useEffect(() => {
    listInterviewSessions()
      .then((sessions) => {
        setHistory(sessions);
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function runPrepGuide() {
    if (!jobTitle.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const content = await generateInterviewPrep({
        jobTitle: jobTitle.trim(),
        jobDescription: jobDescription.trim(),
        resume: resume.trim() || undefined,
      });
      setPrepContent(content);
      setPhase("prep");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate prep guide");
    } finally {
      setLoading(false);
    }
  }

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

      const all: InterviewMessage[] = [...initMessages, { role: "assistant", content: reply }];
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

      const all: InterviewMessage[] = [...withAnswer, { role: "assistant", content: reply }];
      setMessages(all);

      const score = extractReadinessScore(reply);
      if (score !== null) {
        setReadinessScore(score);
        setFinalMessage(reply);
        await updateInterviewSession(sessionId, all, score);
        // Refresh history
        listInterviewSessions().then(setHistory).catch(() => {});
        setPhase("complete");
      } else {
        await updateInterviewSession(sessionId, all);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send answer");
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
    setFinalMessage("");
    setPrepContent("");
    setError(null);
  }

  const displayMessages = messages.slice(1);
  const answersGiven = displayMessages.filter((m) => m.role === "user").length;

  // ── History viewer overlay ─────────────────────────────────────────────────
  if (historySession) {
    const sessionDisplay = (historySession.messages as InterviewMessage[]).slice(1);
    const fb = historySession.readiness_score !== null
      ? parseFinalFeedback(sessionDisplay.findLast((m) => m.role === "assistant")?.content ?? "")
      : null;
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setHistorySession(null)} className="text-sm text-gray-500 hover:text-gray-700">
              ← Back
            </button>
            <div>
              <h2 className="font-bold text-gray-900">{historySession.job_title}</h2>
              <p className="text-xs text-gray-400">
                {new Date(historySession.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
              </p>
            </div>
            {historySession.readiness_score !== null && (
              <div className="ml-auto">
                <ScoreBadge score={historySession.readiness_score} />
              </div>
            )}
          </div>

          {fb && (fb.strengths.length > 0 || fb.areasToWork.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-4">
              {fb.strengths.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">💪 Top Strengths</p>
                  <ul className="space-y-1">
                    {fb.strengths.map((s, i) => <li key={i} className="text-sm text-green-800">• {s}</li>)}
                  </ul>
                </div>
              )}
              {fb.areasToWork.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">📈 Areas to Work On</p>
                  <ul className="space-y-1">
                    {fb.areasToWork.map((a, i) => <li key={i} className="text-sm text-amber-800">• {a}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Transcript</h3>
            <div className="space-y-2">
              {sessionDisplay.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-12 pb-16">
        <div className="max-w-lg mx-auto space-y-6">
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
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the job description for more tailored questions…"
                  rows={4}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Collapsible resume field — used for prep guide */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowResumeField((v) => !v)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  {showResumeField ? "▼ Hide resume" : "▶ Add resume for prep guide (optional)"}
                </button>
                {showResumeField && (
                  <textarea
                    value={resume}
                    onChange={(e) => setResume(e.target.value)}
                    placeholder="Paste your resume text to get personalised interview prep questions…"
                    rows={5}
                    className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                )}
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => void runPrepGuide()}
                  disabled={!jobTitle.trim() || loading}
                  className="flex-1 rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "Generating…" : "📋 Prep Guide"}
                </button>
                <button
                  onClick={() => void startInterview()}
                  disabled={!jobTitle.trim() || loading}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "Starting…" : "Start Interview →"}
                </button>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-center gap-5 text-xs text-gray-400">
              <span>🎯 5–6 questions</span>
              <span>📊 Readiness score</span>
              <span>💡 Instant feedback</span>
            </div>
          </div>

          {/* Past sessions */}
          {historyLoaded && history.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
              <button
                className="w-full flex items-center justify-between px-5 py-4 text-left"
                onClick={() => setShowHistory((v) => !v)}
              >
                <span className="text-sm font-semibold text-gray-800">
                  Past Sessions ({history.length})
                </span>
                <span className="text-gray-400 text-xs">{showHistory ? "▲ Hide" : "▼ Show"}</span>
              </button>
              {showHistory && (
                <div className="border-t border-gray-100 px-3 pb-3 space-y-1">
                  {history.map((s) => (
                    <SessionHistoryItem key={s.id} session={s} onSelect={setHistorySession} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Prep Guide ─────────────────────────────────────────────────────────────
  if (phase === "prep") {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8 pb-16">
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setPhase("setup")}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← Back to setup
            </button>
            <button
              onClick={() => void startInterview()}
              disabled={loading}
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Starting…" : "Start Interview →"}
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">📋</span>
              <h2 className="font-bold text-gray-900">Interview Prep Guide</h2>
              <span className="text-sm text-gray-500">— {jobTitle}</span>
            </div>
            <PrepContent content={prepContent} />
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => void startInterview()}
              disabled={loading}
              className="rounded-xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Starting…" : "✅ Ready — Start Interview →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Complete ───────────────────────────────────────────────────────────────
  if (phase === "complete") {
    const fb = parseFinalFeedback(finalMessage);
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-12 pb-16">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Score card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="text-4xl mb-3">🏆</div>
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

          {/* Structured feedback */}
          {(fb.strengths.length > 0 || fb.areasToWork.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-4">
              {fb.strengths.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3">
                    💪 Top Strengths
                  </p>
                  <ul className="space-y-1.5">
                    {fb.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-green-800 flex gap-2">
                        <span className="shrink-0 text-green-500">✓</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {fb.areasToWork.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">
                    📈 Areas to Work On
                  </p>
                  <ul className="space-y-1.5">
                    {fb.areasToWork.map((a, i) => (
                      <li key={i} className="text-sm text-amber-800 flex gap-2">
                        <span className="shrink-0 text-amber-500">→</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Full transcript */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
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
    <div className="flex flex-col h-[calc(100dvh-129px)] sm:h-[calc(100dvh-65px)]">
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

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="max-w-2xl mx-auto">
          {displayMessages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}

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

      <div className="bg-white border-t border-gray-200 px-4 py-3 shrink-0">
        <div className="max-w-2xl mx-auto flex gap-3 items-end">
          <textarea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer… (Enter to send, Shift+Enter for newline)"
            rows={3}
            disabled={loading}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-gray-50"
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

