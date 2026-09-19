"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSharedPoll } from "@/lib/use-shared-poll";
import type { TranscriptState } from "@/lib/transcript-status";

const btn = "btn btn-sm btn-outline";

// `title` names the lecture in the button labels, so a list of lectures doesn't read as a
// column of identical "Start transcript" buttons to a screen reader.
export default function TranscriptStatus({
  lectureId,
  state,
  title,
}: {
  lectureId: string;
  state: TranscriptState;
  title?: string;
}) {
  const router = useRouter();
  const statusRef = useRef<HTMLDivElement>(null);
  const [starting, setStarting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const processing = state.kind === "processing";

  // While this is being made, join the page's one shared poll (see use-shared-poll.ts).
  useSharedPoll(processing);

  async function start() {
    setStarting(true);
    setProblem(null);
    // The button about to be replaced has focus; hand focus to the status so it isn't lost.
    statusRef.current?.focus();
    try {
      const res = await fetch(`/api/lectures/${lectureId}/transcribe`, { method: "POST" });
      const type = res.headers.get("content-type") ?? "";
      if (res.redirected || !type.includes("application/json")) {
        throw new Error("Your session has ended. Sign in again, then retry.");
      }
      const body = await res.json();
      if (!res.ok && res.status !== 409) {
        throw new Error(body.error ?? "We couldn’t start the transcript. Try again.");
      }
      // Keep the progress message up until the refreshed list arrives.
      startRefresh(() => router.refresh());
      setStarting(false);
    } catch (err) {
      setStarting(false);
      setProblem(
        err instanceof TypeError
          ? "The request didn’t go through because the connection dropped. Check your internet, then try again."
          : (err as Error).message
      );
    }
  }

  const working = processing || starting || refreshing;
  const forLecture = title ? ` for ${title}` : "";

  return (
    <div className="max-w-prose">
      <div className="flex flex-wrap items-center gap-2">
        {/* Always in the page, so a change of text is announced. A region inserted with its text is often missed. */}
        <div ref={statusRef} tabIndex={-1} role="status">
          {!working && state.kind === "ready" && (
            <p className="chip border-success text-success">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 8.5l3.5 3.5L13 4.5" />
              </svg>
              Transcript ready
              {title && <span className="sr-only"> for {title}</span>}
            </p>
          )}
          {working && (
            <p className="chip border-accent text-accent">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                <path d="M8 2a6 6 0 1 0 6 6" />
              </svg>
              Transcribing{forLecture}. This can take a few minutes.
            </p>
          )}
          {!working && state.kind === "pending" && <p className="font-bold">Transcript not started</p>}
        </div>
        {!working && state.kind === "pending" && (
          <button
            type="button"
            onClick={start}
            aria-label={`Start transcript${forLecture}`}
            className={title ? btn : "btn btn-sm btn-primary"}
          >
            Start transcript
          </button>
        )}
      </div>

      {!working && state.kind === "failed" && (
        <div role="alert" className="rounded-md border-2 border-error bg-surface p-3">
          <p className="inline-flex items-center gap-2 font-bold text-error">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M8 2l6.5 12h-13z M8 6.5v3.5 M8 12v.5" />
            </svg>
            Transcription failed{forLecture}
          </p>
          <p className="mt-1">{state.message}</p>
          <button type="button" onClick={start} aria-label={`Try again: transcript${forLecture}`} className={`${btn} mt-2`}>
            Try again
          </button>
        </div>
      )}

      {problem && !working && (
        <p role="alert" className="callout-error mt-2">
          Problem: {problem}
        </p>
      )}
    </div>
  );
}
