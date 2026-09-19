"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GenerationState } from "@/lib/generation-status";

const POLL_MS = 5000;

const btn =
  "rounded-md border-2 border-accent px-3 py-2 font-bold text-accent hover:bg-accent hover:text-surface";

export default function GenerationStatus({
  lectureId,
  state,
  profileLabel,
}: {
  lectureId: string;
  state: GenerationState;
  profileLabel: string;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const processing = state.kind === "processing";

  // While the material is being made, re-read the page until it settles.
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [processing, router]);

  async function start() {
    setStarting(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/lectures/${lectureId}/generate`, { method: "POST" });
      const type = res.headers.get("content-type") ?? "";
      if (res.redirected || !type.includes("application/json")) {
        throw new Error("Your session has ended. Sign in again, then retry.");
      }
      const body = await res.json();
      if (!res.ok && res.status !== 409) {
        throw new Error(body.error ?? "We couldn’t start the study material. Try again.");
      }
      // Keep the progress message up until the refreshed page arrives.
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

  return (
    <div className="max-w-prose">
      {working && (
        <p role="status" className="inline-flex items-center gap-2 rounded-sm border-2 border-accent px-2 py-1 font-bold text-accent">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
            <path d="M8 2a6 6 0 1 0 6 6" />
          </svg>
          Making your study material. This can take a minute or two.
        </p>
      )}

      {!working && state.kind === "none" && (
        <div className="space-y-2">
          <p>
            Your transcript is ready. Make study material for your <strong>{profileLabel}</strong> profile.
          </p>
          <button type="button" onClick={start} className={btn}>Make study material</button>
        </div>
      )}

      {!working && state.kind === "failed" && (
        <div role="alert" className="rounded-md border-2 border-error p-2">
          <p className="inline-flex items-center gap-2 font-bold text-error">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M8 2l6.5 12h-13z M8 6.5v3.5 M8 12v.5" />
            </svg>
            Study material failed
          </p>
          <p className="mt-1">{state.message}</p>
          <button type="button" onClick={start} className={`${btn} mt-2`}>Try again</button>
        </div>
      )}

      {problem && !working && (
        <p role="alert" className="mt-2 rounded-md border-2 border-error px-2 py-1 font-bold text-error">
          Problem: {problem}
        </p>
      )}
    </div>
  );
}
