"use client";

import { useEffect, useRef, useState } from "react";

export type ChatTurn = { id: string; question: string; answer: string };

const MAX_QUESTION = 1000;

/**
 * One conversation: the questions and answers so far, and a box to ask the next. It posts
 * `{ question }` to `endpoint` and expects `{ id, answer }` back, so it serves both the
 * lecture chat (saved) and the site-help chat (not saved) without knowing which.
 */
export default function ChatThread({
  endpoint,
  history,
  intro,
  busyText,
  extraBody,
  focusOnMount,
}: {
  endpoint: string;
  history: ChatTurn[];
  intro: string;
  /** Shown while waiting, e.g. "Finding the answer in the transcript". */
  busyText: string;
  /** Sent with every question. */
  extraBody?: Record<string, unknown>;
  /** Put the cursor in the box when this appears, if focus is already inside the widget. */
  focusOnMount?: boolean;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>(history);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notSaved, setNotSaved] = useState(false);
  const [announce, setAnnounce] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const startCount = useRef(history.length);

  useEffect(() => {
    if (!focusOnMount) return;
    const input = inputRef.current;
    const box = input?.closest('[role="dialog"]');
    // Only when the student is already in the panel, so late-arriving history never steals focus from elsewhere.
    if (input && box && (box.contains(document.activeElement) || document.activeElement === document.body)) input.focus();
  }, [focusOnMount]);

  // A new answer is brought into view from its top, so a long one is read from the start.
  useEffect(() => {
    if (turns.length > startCount.current) listRef.current?.lastElementChild?.scrollIntoView({ block: "start" });
  }, [turns.length]);

  async function ask() {
    const q = question.trim();
    if (asking) return;
    if (!q) {
      setProblem("Type a question first.");
      return inputRef.current?.focus();
    }
    setAsking(q);
    setProblem(null);
    setAnnounce(`${busyText}. This can take a few seconds.`);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, ...extraBody }),
      });
      const type = res.headers.get("content-type") ?? "";
      if (res.redirected || !type.includes("application/json")) throw new Error("Your session has ended. Sign in again, then retry.");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
      setTurns((t) => [...t, { id: data.id, question: q, answer: data.answer }]);
      setQuestion("");
      setNotSaved(data.saved === false);
      setAnnounce(`Answer: ${data.answer}`);
    } catch (err) {
      setProblem(
        err instanceof TypeError
          ? "The request didn’t go through because the connection dropped. Check your internet, then try again."
          : (err as Error).message
      );
      setAnnounce("");
    } finally {
      setAsking(null);
      inputRef.current?.focus();
    }
  }

  return (
    <div>
      <p>{intro}</p>

      {/* Always in the page so a new answer is read out when its text changes. */}
      <p role="status" className="sr-only">{announce}</p>

      <ol ref={listRef} aria-label="Questions and answers" className="mt-4 space-y-4">
        {turns.map((t) => (
          <li key={t.id} className="sheet">
            <p className="font-bold">
              <span className="sr-only">Question: </span>
              {t.question}
            </p>
            <p className="mt-2 whitespace-pre-line">
              <span className="font-bold text-accent">Answer: </span>
              {t.answer}
            </p>
          </li>
        ))}
        {asking && (
          <li className="sheet">
            <p className="font-bold">
              <span className="sr-only">Question: </span>
              {asking}
            </p>
            <p className="chip mt-2 border-accent text-accent">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                <path d="M8 2a6 6 0 1 0 6 6" />
              </svg>
              {busyText}…
            </p>
          </li>
        )}
      </ol>

      {notSaved && (
        <p className="mt-3 font-bold">Note: This answer couldn’t be saved, so it won’t be here after you reload.</p>
      )}

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <label htmlFor="chat-question" className="font-bold">Your question</label>
        <textarea
          ref={inputRef}
          id="chat-question"
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          // Enter sends; Shift+Enter starts a new line.
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void ask();
            }
          }}
          readOnly={!!asking}
          maxLength={MAX_QUESTION}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? "chat-question-error chat-question-hint" : "chat-question-hint"}
          className="field"
        />
        <p id="chat-question-hint" className="mt-2 text-sm">
          Press Enter to send, or Shift and Enter for a new line.
        </p>

        {problem && (
          <p id="chat-question-error" role="alert" className="callout-error mt-2 inline-flex items-start gap-2">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="mt-1 shrink-0">
              <path d="M8 2l6.5 12h-13z M8 6.5v3.5 M8 12v.5" />
            </svg>
            <span>Problem: {problem}</span>
          </p>
        )}

        <div className="mt-3">
          <button type="submit" aria-disabled={!!asking} className="btn btn-primary">
            {asking ? "Asking…" : "Ask"}
          </button>
        </div>
      </form>
    </div>
  );
}
