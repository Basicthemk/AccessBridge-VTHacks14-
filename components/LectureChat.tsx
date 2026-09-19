"use client";

import { useRef, useState } from "react";

export type ChatTurn = { id: string; question: string; answer: string };

const MAX_QUESTION = 1000;

export default function LectureChat({ lectureId, history }: { lectureId: string; history: ChatTurn[] }) {
  const [turns, setTurns] = useState<ChatTurn[]>(history);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notSaved, setNotSaved] = useState(false);
  const [announce, setAnnounce] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function ask() {
    const q = question.trim();
    if (asking) return;
    if (!q) {
      setProblem("Type a question first.");
      return inputRef.current?.focus();
    }
    setAsking(q);
    setProblem(null);
    setAnnounce("Finding the answer in the transcript. This can take a few seconds.");
    try {
      const res = await fetch(`/api/lectures/${lectureId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
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
    <div className="max-w-prose">
      <p>
        Ask about anything in this lecture. Answers come only from the transcript, and if it doesn’t say, you’ll be told so.
      </p>

      {/* Always in the page so a new answer is read out when its text changes. */}
      <p role="status" className="sr-only">{announce}</p>

      <ol aria-label="Questions and answers" className="mt-4 space-y-4">
        {turns.map((t) => (
          <li key={t.id} className="sheet">
            <p className="font-bold">
              <span className="sr-only">Question: </span>
              {t.question}
            </p>
            <p className="reading mt-2 whitespace-pre-line">
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
              Finding the answer in the transcript…
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
        <label htmlFor="lecture-question" className="font-bold">Your question</label>
        <textarea
          ref={inputRef}
          id="lecture-question"
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
          aria-describedby={problem ? "lecture-question-error lecture-question-hint" : "lecture-question-hint"}
          className="field"
        />
        <p id="lecture-question-hint" className="mt-2 text-sm">
          Press Enter to send, or Shift and Enter for a new line.
        </p>

        {problem && (
          <p id="lecture-question-error" role="alert" className="callout-error mt-2 inline-flex max-w-prose items-start gap-2">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="mt-1 shrink-0">
              <path d="M8 2l6.5 12h-13z M8 6.5v3.5 M8 12v.5" />
            </svg>
            <span>Problem: {problem}</span>
          </p>
        )}

        <div className="mt-3">
          <button type="submit" aria-disabled={!!asking} className="btn btn-primary">
            {asking ? "Finding the answer…" : "Ask"}
          </button>
        </div>
      </form>
    </div>
  );
}
