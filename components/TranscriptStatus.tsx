"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSharedPoll } from "@/lib/use-shared-poll";
import { SessionEndedError, useExplainError } from "@/lib/client-errors";
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
  const t = useTranslations("TranscriptStatus");
  const tc = useTranslations("Common");
  const explain = useExplainError();
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
        throw new SessionEndedError();
      }
      const body = await res.json();
      if (!res.ok && res.status !== 409) {
        throw new Error(body.error ?? t("startError"));
      }
      // Keep the progress message up until the refreshed list arrives.
      startRefresh(() => router.refresh());
      setStarting(false);
    } catch (err) {
      setStarting(false);
      setProblem(explain(err));
    }
  }

  const working = processing || starting || refreshing;

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
              {t("ready")}
              {title && <span className="sr-only"> {t("forTitle", { title })}</span>}
            </p>
          )}
          {working && (
            <p className="chip border-accent text-accent">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                <path d="M8 2a6 6 0 1 0 6 6" />
              </svg>
              {title ? t("transcribingFor", { title }) : t("transcribing")}
            </p>
          )}
          {!working && state.kind === "pending" && <p className="font-bold">{t("notStarted")}</p>}
        </div>
        {!working && state.kind === "pending" && (
          <button
            type="button"
            onClick={start}
            aria-label={title ? t("startFor", { title }) : t("start")}
            className={title ? btn : "btn btn-sm btn-primary"}
          >
            {t("start")}
          </button>
        )}
      </div>

      {!working && state.kind === "failed" && (
        <div role="alert" className="rounded-md border-2 border-error bg-surface p-3">
          <p className="inline-flex items-center gap-2 font-bold text-error">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M8 2l6.5 12h-13z M8 6.5v3.5 M8 12v.5" />
            </svg>
            {title ? t("failedFor", { title }) : t("failed")}
          </p>
          <p className="mt-1">{state.message}</p>
          <button type="button" onClick={start} aria-label={title ? t("tryAgainFor", { title }) : t("tryAgain")} className={`${btn} mt-2`}>
            {t("tryAgain")}
          </button>
        </div>
      )}

      {problem && !working && (
        <p role="alert" className="callout-error mt-2">
          {tc("problem", { message: problem })}
        </p>
      )}
    </div>
  );
}
