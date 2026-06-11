"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageSquareText, RotateCcw, SendHorizonal } from "lucide-react";
import { fmtDate } from "@/lib/format";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole | string;
  content: string;
  created_at: string;
}

interface SessionPayload {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export function ProjectDataChat({ projectId }: { projectId: string }) {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startFresh, setStartFresh] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoadingHistory(true);
    setError(null);

    (async () => {
      try {
        const response = await fetch(`/api/proyectos/${projectId}/chat`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          ok: boolean;
          detail?: string;
          session?: SessionPayload;
          messages?: ChatMessage[];
        };
        if (!alive) return;
        if (!payload.ok) {
          setError(payload.detail ?? "We couldn't load the conversation history.");
          return;
        }
        setSession(payload.session ?? null);
        setMessages(payload.messages ?? []);
      } catch (err) {
        if (!alive || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "We couldn't load the conversation history.");
      } finally {
        if (alive) setLoadingHistory(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const canSend = useMemo(() => {
    return input.trim().length > 0 && !sending;
  }, [input, sending]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);
    setInput("");

    const optimisticUser: ChatMessage = {
      id: `tmp-user-${Date.now()}`,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const response = await fetch(`/api/proyectos/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session?.id ?? null,
          new_session: startFresh,
          message: trimmed,
        }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        detail?: string;
        session?: SessionPayload;
        assistant_message?: ChatMessage;
        messages?: ChatMessage[];
      };

      if (!payload.ok) {
        setError(payload.detail ?? "We couldn't get a response from the chat.");
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
        setInput(trimmed);
        return;
      }

      if (payload.session) setSession(payload.session);
      setStartFresh(false);
      const returnedMessages = payload.messages ?? [];
      const returnedUser = returnedMessages.find((m) => m.role === "user");
      const returnedAssistant = payload.assistant_message ?? returnedMessages.find((m) => m.role === "assistant");

      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== optimisticUser.id);
        const next = [...withoutOptimistic];
        if (returnedUser) next.push(returnedUser);
        if (returnedAssistant) next.push(returnedAssistant);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't get a response from the chat.");
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
      setInput(trimmed);
    } finally {
      setSending(false);
    }
  }

  function clearLocalConversation() {
    setSession(null);
    setMessages([]);
    setInput("");
    setError(null);
    setStartFresh(true);
  }

  return (
    <section className="rounded-2xl border border-line bg-canvas-raised">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-display text-xl text-ink">Chat with your data</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Ask about costs, progress, forecast, and critical supply risk for this project.
          </p>
        </div>
        <button
          type="button"
          onClick={clearLocalConversation}
          className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas px-3 py-1.5 text-xs text-ink-soft hover:text-ink"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Clear
        </button>
      </header>

      <div className="px-5 py-4">
        {loadingHistory ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-ink-soft">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Loading history...
          </div>
        ) : messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-canvas px-4 py-10 text-center text-sm text-ink-soft">
            <MessageSquareText className="mx-auto mb-3 h-6 w-6 text-ink-soft" aria-hidden="true" />
            Start by asking something like:{" "}
            <span className="text-ink">"What is the projected overrun for this project?"</span>
          </div>
        ) : (
          <ul className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
            {messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <li
                  key={message.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      isUser
                        ? "bg-ink text-canvas"
                        : "border border-line bg-canvas text-ink"
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    <p
                      className={`mt-1.5 text-[11px] ${
                        isUser ? "text-canvas/70" : "text-ink-soft"
                      }`}
                    >
                      {fmtDate(message.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
            <div ref={bottomRef} />
          </ul>
        )}

        {error ? (
          <p className="mt-3 rounded-xl border border-status-risk/30 bg-status-risk/10 px-3 py-2 text-xs text-status-risk">
            {error}
          </p>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-line px-5 py-4">
        <div className="flex items-end gap-3">
          <label className="sr-only" htmlFor="chat_input">
            Message
          </label>
          <textarea
            id="chat_input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            maxLength={3000}
            placeholder="Ask a question about this project..."
            className="min-h-[84px] w-full resize-y rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-soft focus:border-ink/40 focus:ring-2 focus:ring-accent/25"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-ink px-4 text-canvas transition-colors hover:bg-[#1a1a1c] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Send message"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <SendHorizonal className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
