"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_BODY, checkBody, checkProfessorEmail } from "@/lib/accommodation";

export type ResumableDraft = { id: string; body: string; professorEmail: string; savedOn: string };

// Edits are kept in this browser only, per draft, so a reload doesn't lose them. Cleared on send.
const editsKey = (id: string) => `ab-draft-${id}`;
function loadEdits(id: string): { to: string; body: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(editsKey(id)) ?? "null");
    return v && typeof v.to === "string" && typeof v.body === "string" ? v : null;
  } catch {
    return null;
  }
}
function saveEdits(id: string, to: string, body: string) {
  try {
    localStorage.setItem(editsKey(id), JSON.stringify({ to, body }));
  } catch {
    // Storage can be blocked or full. The draft still works for this page view.
  }
}
function clearEdits(id: string) {
  try {
    localStorage.removeItem(editsKey(id));
  } catch {
    // Nothing to clean up if storage is blocked.
  }
}

type Stage = "idle" | "drafting" | "editing" | "sending" | "sent";

const outlineBtn = "btn btn-outline";
const primaryBtn = "btn btn-primary";
const field = "field";

function ErrorBox({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p
      id={id}
      role="alert"
      className="callout-error mt-2 inline-flex max-w-prose items-start gap-2"
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
  resumable,
  senderReady,
}: {
  lectureId: string;
  profileLabel: string;
  studentEmail: string;
  resumable: ResumableDraft | null;
  /** False when the server has no verified sending address, so professors’ emails would be rejected. */
  senderReady: boolean;
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
  const [resume, setResume] = useState<ResumableDraft | null>(resumable);
  const [confirmingNew, setConfirmingNew] = useState(false);
  // The text as last written by the model, so we can tell whether the student has changed it.
  const originalBody = useRef("");
  const keepRef = useRef<HTMLButtonElement>(null);
  const newDraftBtnRef = useRef<HTMLButtonElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const sentRef = useRef<HTMLDivElement>(null);

  const busy = stage === "drafting" || stage === "sending";

  useEffect(() => {
    if (stage === "editing" && draftId) saveEdits(draftId, to, body);
  }, [stage, draftId, to, body]);

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

  // Writing a new draft replaces the message, so ask first if the student has changed it.
  function askNewDraft() {
    if (busy) return;
    if (draftId && body !== originalBody.current) {
      setConfirmingNew(true);
      setAnnounce("You have edits in this message. Choose Replace with a new draft, or Keep my edits.");
      setTimeout(() => keepRef.current?.focus(), 0);
      return;
    }
    void draft();
  }

  function keepEdits() {
    setConfirmingNew(false);
    setAnnounce("Kept your edits.");
    setTimeout(() => newDraftBtnRef.current?.focus(), 0);
  }

  function resumeDraft(r: ResumableDraft) {
    const saved = loadEdits(r.id);
    setDraftId(r.id);
    originalBody.current = r.body;
    setTo(saved?.to ?? r.professorEmail);
    setBody(saved?.body ?? r.body);
    setToError(null);
    setBodyError(null);
    setProblem(null);
    setResume(null);
    setStage("editing");
    setAnnounce(
      saved
        ? "Resumed your draft with the edits you made in this browser. Check the message, then choose Send email."
        : "Resumed your draft. Check the message, then choose Send email."
    );
    setTimeout(() => toRef.current?.focus(), 0);
  }

  async function draft() {
    if (busy) return;
    setConfirmingNew(false);
    setStage("drafting");
    setProblem(null);
    setAnnounce("Writing your draft. This can take a few seconds.");
    try {
      const data = await callJson(`/api/lectures/${lectureId}/accommodation`, { method: "POST" });
      if (draftId) clearEdits(draftId);
      setDraftId(data.id);
      originalBody.current = data.body;
      setResume(null);
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
      clearEdits(draftId);
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
    setConfirmingNew(false);
    setResume(null);
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

      {!senderReady && (
        <div role="group" aria-labelledby="sender-title" className="mt-4 rounded-md border-2 border-error bg-surface p-3">
          <p id="sender-title" className="font-bold text-error">Sending isn’t set up for professors yet.</p>
          <p className="mt-1">
            You can still write and edit a draft, then copy it into your own email. Choosing Send email will be
            rejected until the site owner verifies a sending address.
          </p>
        </div>
      )}

      {/* Always in the page so progress is announced when its text changes. */}
      <p role="status" className="sr-only">{announce}</p>

      {stage === "idle" && resume && (
        <div role="group" aria-labelledby="resume-title" className="mt-4 rounded-md border-2 border-accent bg-surface p-3">
          <p id="resume-title" className="font-bold">You have an unsent draft from {resume.savedOn}.</p>
          <p className="mt-1">Pick up where you left off, or write a new one.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => resumeDraft(resume)} className={primaryBtn}>
              Resume draft
            </button>
            <button type="button" onClick={draft} className={outlineBtn}>
              Draft an email
            </button>
          </div>
        </div>
      )}

      {stage === "idle" && !resume && (
        <button type="button" onClick={draft} className={`${outlineBtn} mt-4`}>
          Draft an email
        </button>
      )}

      {stage === "drafting" && (
        <p className="chip mt-4 border-accent text-accent">
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
          className="mt-4 rounded-lg border-2 border-success bg-surface p-4"
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
          <button type="button" onClick={reset} className={`${outlineBtn} mt-4`}>
            Write another request
          </button>
        </div>
      )}

      {(stage === "editing" || stage === "sending") && (
        <div className="sheet mt-4 space-y-4">
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
            <p id="prof-email-hint" className="mt-2 text-sm">For example, name@school.edu</p>
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
            <p id="prof-body-hint" className="mt-2 text-sm">
              Replace [Your name] with your name. {body.length.toLocaleString("en-US")} of{" "}
              {MAX_BODY.toLocaleString("en-US")} characters.
            </p>
            {bodyError && <ErrorBox id="prof-body-error">{bodyError}</ErrorBox>}
          </div>

          {problem && <ErrorBox>{problem}</ErrorBox>}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <button type="button" onClick={send} aria-disabled={busy} className={primaryBtn}>
              {stage === "sending" ? "Sending…" : "Send email"}
            </button>
            <button ref={newDraftBtnRef} type="button" onClick={askNewDraft} aria-disabled={busy} className="btn btn-quiet">
              Write a new draft
            </button>
          </div>

          {confirmingNew && (
            <div role="group" aria-labelledby="replace-title" className="rounded-md border-2 border-error bg-surface p-3">
              <p id="replace-title" className="inline-flex items-start gap-2 font-bold text-error">
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="mt-1 shrink-0">
                  <path d="M8 2l6.5 12h-13z M8 6.5v3.5 M8 12v.5" />
                </svg>
                <span>Replace your edits?</span>
              </p>
              <p className="mt-1">A new draft replaces the message above, including the changes you made. The professor’s address stays.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button ref={keepRef} type="button" onClick={keepEdits} className={primaryBtn}>
                  Keep my edits
                </button>
                <button type="button" onClick={draft} aria-disabled={busy} className={outlineBtn}>
                  Replace with a new draft
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {stage === "idle" && problem && <ErrorBox>{problem}</ErrorBox>}
    </div>
  );
}
