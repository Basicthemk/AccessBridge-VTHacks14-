"use client";

import { useRef, useState } from "react";
import { MAX_BODY, checkBody, checkProfessorEmail } from "@/lib/accommodation";

type Stage = "idle" | "drafting" | "editing" | "sending" | "sent";

const outlineBtn =
  "rounded-md border-2 border-accent px-3 py-2 font-bold text-accent hover:bg-accent hover:text-surface aria-disabled:opacity-60";
const primaryBtn =
  "rounded-md bg-primary-dark px-4 py-3 font-bold text-surface transition-colors hover:bg-ink aria-disabled:opacity-60";
const field = "mt-1 block w-full rounded-md border-2 border-accent bg-surface px-3 py-2 text-ink";

function ErrorBox({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p
      id={id}
      role="alert"
      className="mt-2 inline-flex max-w-prose items-start gap-2 rounded-md border-2 border-error bg-surface px-2 py-1 font-bold text-error"
    >
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="mt-1 shrink-0">
        <path d="M8 2l6.5 12h-13z M8 6.5v3.5 M8 12v.5" />
      </svg>
      <span>Problem: {children}</span>
    </p>
  );
}

export default function AccommodationRequest({
  lectureId,
  profileLabel,
  studentEmail,
}: {
  lectureId: string;
  profileLabel: string;
  studentEmail: string;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [toError, setToError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [announce, setAnnounce] = useState("");
  const toRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const sentRef = useRef<HTMLDivElement>(null);

  const busy = stage === "drafting" || stage === "sending";

  async function callJson(url: string, init?: RequestInit) {
    const res = await fetch(url, init);
    const type = res.headers.get("content-type") ?? "";
    if (res.redirected || !type.includes("application/json")) {
      throw new Error("Your session has ended. Sign in again, then retry.");
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
    return data;
  }

  const explain = (err: unknown) =>
    err instanceof TypeError
      ? "The request didn’t go through because the connection dropped. Check your internet, then try again."
      : (err as Error).message;

  async function draft() {
    if (busy) return;
    setStage("drafting");
    setProblem(null);
    setAnnounce("Writing your draft. This can take a few seconds.");
    try {
      const data = await callJson(`/api/lectures/${lectureId}/accommodation`, { method: "POST" });
      setDraftId(data.id);
      setBody(data.body);
      setToError(null);
      setBodyError(null);
      setStage("editing");
      setAnnounce("Draft ready. Enter your professor’s email address, read the message, then choose Send email.");
      // Wait for the fields to render, then land on the first one.
      setTimeout(() => toRef.current?.focus(), 0);
    } catch (err) {
      setStage(draftId ? "editing" : "idle");
      setProblem(explain(err));
      setAnnounce("");
    }
  }

  async function send() {
    if (busy || !draftId) return;
    const email = checkProfessorEmail(to);
    const text = checkBody(body);
    setToError(email.ok ? null : email.message);
    setBodyError(text.ok ? null : text.message);
    setProblem(null);
    if (!email.ok) return toRef.current?.focus();
    if (!text.ok) return bodyRef.current?.focus();

    setStage("sending");
    setAnnounce("Sending your email.");
    try {
      const data = await callJson(`/api/accommodations/${draftId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professorEmail: email.value, body: text.value }),
      });
      setSentTo(data.to);
      setStage("sent");
      setAnnounce(`Email sent to ${data.to}.`);
      setTimeout(() => sentRef.current?.focus(), 0);
    } catch (err) {
      setStage("editing");
      setProblem(explain(err));
      setAnnounce("");
    }
  }

  function reset() {
    setStage("idle");
    setDraftId(null);
    setTo("");
    setBody("");
    setProblem(null);
    setAnnounce("");
  }

  return (
    <div className="max-w-prose">
      <p>
        Draft a short email to your professor asking for what fits your <strong>{profileLabel}</strong> profile. You can
        change every word, and nothing is sent until you choose Send email.
      </p>

      {/* Always in the page so progress is announced when its text changes. */}
      <p role="status" className="sr-only">{announce}</p>

      {stage === "idle" && (
        <button type="button" onClick={draft} className={`${outlineBtn} mt-3`}>
          Draft an email
        </button>
      )}

      {stage === "drafting" && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-sm border-2 border-accent px-2 py-1 font-bold text-accent">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
            <path d="M8 2a6 6 0 1 0 6 6" />
          </svg>
          Writing your draft. This can take a few seconds.
        </p>
      )}

      {stage === "sent" && (
        <div
          ref={sentRef}
          tabIndex={-1}
          className="mt-3 rounded-md border-2 border-success bg-surface p-3"
        >
          <p className="inline-flex items-center gap-2 font-bold text-success">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 8.5l3.5 3.5L13 4.5" />
            </svg>
            Email sent
          </p>
          <p className="mt-1">
            Sent to <strong>{sentTo}</strong>. Replies go to <strong>{studentEmail}</strong>.
          </p>
          <button type="button" onClick={reset} className={`${outlineBtn} mt-3`}>
            Write another request
          </button>
        </div>
      )}

      {(stage === "editing" || stage === "sending") && (
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="prof-email" className="font-bold">Professor’s email address</label>
            <input
              ref={toRef}
              id="prof-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              readOnly={stage === "sending"}
              aria-required="true"
              aria-invalid={toError ? true : undefined}
              aria-describedby={toError ? "prof-email-error" : "prof-email-hint"}
              className={field}
            />
            <p id="prof-email-hint" className="mt-1 text-sm">For example, name@school.edu</p>
            {toError && <ErrorBox id="prof-email-error">{toError}</ErrorBox>}
          </div>

          <div>
            <label htmlFor="prof-body" className="font-bold">Message</label>
            <textarea
              ref={bodyRef}
              id="prof-body"
              rows={14}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              readOnly={stage === "sending"}
              maxLength={MAX_BODY + 500}
              aria-required="true"
              aria-invalid={bodyError ? true : undefined}
              aria-describedby={bodyError ? "prof-body-error" : "prof-body-hint"}
              className={field}
            />
            <p id="prof-body-hint" className="mt-1 text-sm">
              Replace [Your name] with your name. {body.length.toLocaleString("en-US")} of{" "}
              {MAX_BODY.toLocaleString("en-US")} characters.
            </p>
            {bodyError && <ErrorBox id="prof-body-error">{bodyError}</ErrorBox>}
          </div>

          {problem && <ErrorBox>{problem}</ErrorBox>}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={send} aria-disabled={busy} className={primaryBtn}>
              {stage === "sending" ? "Sending…" : "Send email"}
            </button>
            <button type="button" onClick={draft} aria-disabled={busy} className={outlineBtn}>
              Write a new draft
            </button>
          </div>
        </div>
      )}

      {stage === "idle" && problem && <ErrorBox>{problem}</ErrorBox>}
    </div>
  );
}
