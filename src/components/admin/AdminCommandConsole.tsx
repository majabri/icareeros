/**
 * AdminCommandConsole — secure terminal-style command interface
 * Calls the admin-command edge function via supabase.functions.invoke.
 * Commands are validated client-side against ALLOWED_COMMANDS before dispatch.
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";

export interface AdminCommandResponse {
  command: string;
  args: Record<string, string>;
  result: Record<string, unknown>;
  success: boolean;
  timestamp: string;
  error?: string;
}

export const ALLOWED_COMMANDS = [
  {
    name: "agent.retry",
    description: "Retry a failed agent run",
    example: 'agent.retry run_id="<uuid>"',
  },
  {
    name: "agent.run",
    description: "Manually trigger an agent run with a job description",
    example: 'agent.run job_description="Software Engineer at Acme"',
  },
  {
    name: "queue.clear",
    description: "Clear all pending and failed jobs from the queue",
    example: "queue.clear",
  },
  {
    name: "queue.stats",
    description: "Show current queue statistics",
    example: "queue.stats",
  },
  {
    name: "user.disable",
    description: "Disable a user account by email",
    example: 'user.disable email="user@example.com"',
  },
  {
    name: "user.promote",
    description: "Promote a user to admin by email",
    example: 'user.promote email="user@example.com"',
  },
  {
    name: "system.health",
    description: "Check overall system health via edge function",
    example: "system.health",
  },
] as const;

const VALID_NAMES = new Set(ALLOWED_COMMANDS.map(c => c.name));

function parseCommandString(input: string): { command: string; args: Record<string, string> } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.match(/^(\S+)([\s\S]*)/);
  if (!parts) return null;
  const command = parts[1];
  const rest = parts[2].trim();
  const args: Record<string, string> = {};
  if (rest) {
    const argMatches = rest.matchAll(/(\w+)=(?:"([^"]*?)"|'([^']*?)'|(\S+))/g);
    for (const m of argMatches) {
      args[m[1]] = m[2] ?? m[3] ?? m[4] ?? "";
    }
  }
  return { command, args };
}

const WELCOME = `
╔══════════════════════════════════════════════════╗
║  iCareerOS Admin Command Console v1.0            ║
║  Type "help" for available commands              ║
╚══════════════════════════════════════════════════╝

IMPORTANT: Only registered commands are allowed.
No shell or OS access. All commands are logged.`.trim();

interface HistoryEntry {
  id: string;
  input: string;
  response: AdminCommandResponse | null;
  timestamp: Date;
  loading: boolean;
}

export function AdminCommandConsole() {
  const [input, setInput]         = useState("");
  const [history, setHistory]     = useState<HistoryEntry[]>([]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showHelp, setShowHelp]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const scrollBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  useEffect(() => { scrollBottom(); }, [history, scrollBottom]);

  function handleInput(val: string) {
    setInput(val);
    setHistoryIdx(-1);
    if (!val.trim()) { setSuggestions([]); return; }
    const lower = val.toLowerCase();
    setSuggestions(ALLOWED_COMMANDS.map(c => c.name).filter(n => n.startsWith(lower)).slice(0, 5));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter")      { e.preventDefault(); void submit(input); }
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const idx = Math.min(historyIdx + 1, cmdHistory.length - 1);
      setHistoryIdx(idx);
      setInput(cmdHistory[idx] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(idx);
      setInput(idx === -1 ? "" : (cmdHistory[idx] ?? ""));
    } else if (e.key === "Tab" && suggestions.length > 0) {
      e.preventDefault();
      setInput(suggestions[0] + " ");
      setSuggestions([]);
    } else if (e.key === "Escape") {
      setSuggestions([]);
    }
  }

  async function submit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setSuggestions([]);
    setInput("");
    setCmdHistory(prev => [trimmed, ...prev].slice(0, 50));
    setHistoryIdx(-1);

    // Built-in: clear
    if (trimmed === "clear") { setHistory([]); return; }

    // Built-in: help
    if (trimmed === "help") {
      const resp: AdminCommandResponse = {
        command: "help", args: {},
        result: {
          commands: ALLOWED_COMMANDS.map(c => ({
            name: c.name, description: c.description, example: c.example,
          })),
        },
        success: true, timestamp: new Date().toISOString(),
      };
      setHistory(prev => [...prev, { id: crypto.randomUUID(), input: trimmed, response: resp, timestamp: new Date(), loading: false }]);
      return;
    }

    const parsed = parseCommandString(trimmed);
    if (!parsed) {
      addError(trimmed, "Invalid command format");
      return;
    }
    if (!VALID_NAMES.has(parsed.command as "agent.retry")) {
      addError(trimmed, `Unrecognised command: "${parsed.command}". Type "help" for available commands.`);
      return;
    }

    const id = crypto.randomUUID();
    setHistory(prev => [...prev, { id, input: trimmed, response: null, timestamp: new Date(), loading: true }]);

    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("admin-command", {
      body: { command: parsed.command, args: parsed.args },
    });

    const resp: AdminCommandResponse = error
      ? { command: parsed.command, args: parsed.args, result: { error: error.message }, success: false, timestamp: new Date().toISOString() }
      : (data as AdminCommandResponse);

    setHistory(prev => prev.map(h => h.id === id ? { ...h, response: resp, loading: false } : h));
  }

  function addError(input: string, msg: string) {
    const resp: AdminCommandResponse = {
      command: input, args: {}, result: { error: msg }, success: false, timestamp: new Date().toISOString(),
    };
    setHistory(prev => [...prev, { id: crypto.randomUUID(), input, response: resp, timestamp: new Date(), loading: false }]);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Admin Console</h2>
          <p className="text-xs text-gray-400 mt-0.5">Secure command execution — strict registry only, all actions logged</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowHelp(v => !v)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            {showHelp ? "Hide help" : "Help"}
          </button>
          <button
            onClick={() => setHistory([])}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Help panel */}
      {showHelp && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
          <p className="text-xs font-semibold text-blue-700">Available Commands</p>
          {ALLOWED_COMMANDS.map(cmd => (
            <div key={cmd.name} className="flex items-start gap-3 text-xs">
              <code className="rounded bg-white px-1.5 py-0.5 font-mono text-blue-600 border border-blue-200 shrink-0">{cmd.name}</code>
              <div>
                <p className="text-gray-700">{cmd.description}</p>
                <p className="text-gray-400 font-mono mt-0.5">Example: {cmd.example}</p>
              </div>
            </div>
          ))}
          <div className="flex items-start gap-3 text-xs">
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-blue-600 border border-blue-200 shrink-0">clear</code>
            <p className="text-gray-700">Clear terminal output</p>
          </div>
        </div>
      )}

      {/* Terminal */}
      <div className="rounded-xl border border-gray-800 bg-[#0d1117] shadow-sm overflow-hidden">
        <div
          className="min-h-[380px] max-h-[480px] overflow-y-auto p-4 space-y-3 font-mono text-xs cursor-text"
          onClick={() => inputRef.current?.focus()}
        >
          <pre className="text-green-600 text-[10px] leading-relaxed whitespace-pre">{WELCOME}</pre>

          {history.map(entry => (
            <div key={entry.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-green-700 text-[10px]">{entry.timestamp.toLocaleTimeString()}</span>
                <span className="text-green-500">$</span>
                <span className="text-white">{entry.input}</span>
              </div>
              {entry.loading
                ? <div className="pl-4 text-[10px] text-yellow-400 flex items-center gap-1"><span className="animate-spin">⏳</span> Executing…</div>
                : entry.response && <OutputBlock response={entry.response} />
              }
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input row */}
        <div className="relative border-t border-gray-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-green-500 font-mono text-sm">$</span>
            <input
              ref={inputRef}
              value={input}
              onChange={e => handleInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command… (Tab autocomplete · ↑↓ history)"
              className="flex-1 bg-transparent font-mono text-xs text-white placeholder-gray-700 outline-none"
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {suggestions.length > 0 && (
            <div className="absolute bottom-full left-8 mb-1 min-w-48 rounded border border-gray-700 bg-[#161b22] shadow-lg z-10">
              {suggestions.map(s => (
                <button
                  key={s}
                  className="block w-full px-3 py-1.5 text-left text-xs font-mono text-green-400 hover:bg-green-900/30 transition-colors"
                  onMouseDown={e => { e.preventDefault(); setInput(s + " "); setSuggestions([]); inputRef.current?.focus(); }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Command history */}
      {cmdHistory.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-medium text-gray-500">Command history</p>
          <div className="flex flex-wrap gap-1.5">
            {cmdHistory.slice(0, 10).map((cmd, i) => (
              <button
                key={i}
                onClick={() => { setInput(cmd); inputRef.current?.focus(); }}
                className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OutputBlock({ response }: { response: AdminCommandResponse }) {
  const { success, result, command } = response;

  if (command === "help" && result.commands) {
    return (
      <div className="pl-4 space-y-1 text-[10px]">
        {(result.commands as Array<{ name: string; description: string; example: string }>).map(cmd => (
          <div key={cmd.name} className="flex gap-3">
            <span className="text-cyan-400 w-28 shrink-0">{cmd.name}</span>
            <span className="text-green-600">{cmd.description}</span>
          </div>
        ))}
        <div className="flex gap-3">
          <span className="text-cyan-400 w-28 shrink-0">clear</span>
          <span className="text-green-600">Clear terminal output</span>
        </div>
        <div className="flex gap-3">
          <span className="text-cyan-400 w-28 shrink-0">help</span>
          <span className="text-green-600">Show this help</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pl-4">
      <div className={`flex items-center gap-1.5 text-[10px] mb-1 ${success ? "text-green-500" : "text-red-400"}`}>
        <span>{success ? "✓" : "✕"}</span>
        <span>{success ? "Success" : "Error"}</span>
      </div>
      <pre className={`text-[10px] leading-relaxed whitespace-pre-wrap break-all ${success ? "text-green-300" : "text-red-300"}`}>
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}
