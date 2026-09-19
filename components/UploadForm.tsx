"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ACCEPT_ATTR,
  FORMATS_LABEL,
  LECTURE_BUCKET,
  MAX_BYTES,
  MAX_TITLE,
  checkFile,
  formatBytes,
  titleFromFilename,
} from "@/lib/upload";

type Stage = "choose" | "uploading" | "saving" | "done";
type Picked = { file: File; contentType: string; ext: string };

const primaryBtn =
  "rounded-md bg-primary px-4 py-3 font-bold text-surface transition-colors hover:bg-primary-dark disabled:opacity-60";
const outlineBtn =
  "rounded-md border-2 border-accent px-4 py-3 font-bold text-accent hover:bg-accent hover:text-surface";

export default function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [stage, setStage] = useState<Stage>("choose");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [announce, setAnnounce] = useState("");

  const busy = stage === "uploading" || stage === "saving";
  const percent = picked ? Math.min(100, Math.round((loaded / picked.file.size) * 100)) : 0;

  // Warn before leaving mid-upload.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  function choose(files: FileList | null) {
    if (busy || !files || files.length === 0) return;
    setError(null);
    if (files.length > 1) {
      setError({ message: "Add one recording at a time. Drop a single file, then upload the next one afterwards." });
      return;
    }
    const file = files[0];
    const check = checkFile(file);
    if (!check.ok) {
      setPicked(null);
      setError({ message: check.message });
      return;
    }
    setPicked({ file, contentType: check.contentType, ext: check.ext });
    setTitle((t) => t.trim() || titleFromFilename(file.name));
  }

  function clearFile() {
    setPicked(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function sendToStorage(url: string, token: string, apikey: string, body: Blob, name: string) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open("POST", url);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", apikey);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        setLoaded(e.loaded);
        const pct = Math.floor((e.loaded / e.total) * 10) * 10;
        setAnnounce(`Uploading, ${pct} percent`);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        let detail = "";
        try {
          detail = JSON.parse(xhr.responseText).message ?? "";
        } catch {}
        reject({ status: xhr.status, detail });
      };
      xhr.onerror = () => reject({ status: 0, detail: "" });
      xhr.onabort = () => reject({ status: -1, detail: "" });
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", body, name);
      xhr.send(form);
    });
  }

  function explain(status: number, detail: string): { message: string; detail?: string } {
    if (status === 0)
      return { message: "The upload was interrupted because the connection dropped. Check your internet, then choose Upload lecture to try again." };
    if (status === 413)
      return { message: `The server rejected the file as too large. The limit is ${formatBytes(MAX_BYTES)}.` };
    if (status === 401 || status === 403)
      return { message: "Your session has ended, so the upload was not saved. Sign in again, then retry.", detail };
    if (status === 404 || /bucket not found/i.test(detail))
      return { message: "Lecture storage isn’t set up yet, so nothing was saved. Try again later.", detail };
    return { message: "The upload failed and nothing was saved. Try again in a moment.", detail: detail || `Status ${status}` };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked || busy) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError({ message: "Give the lecture a title so you can find it later." });
      return;
    }
    setError(null);
    setLoaded(0);
    setStage("uploading");

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setStage("choose");
      setError(explain(401, ""));
      return;
    }

    const path = `${session.user.id}/${crypto.randomUUID()}.${picked.ext}`;
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${LECTURE_BUCKET}/${path}`;
    const blob = picked.file.slice(0, picked.file.size, picked.contentType);

    try {
      await sendToStorage(url, session.access_token, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, blob, path);
    } catch (err) {
      const { status, detail } = err as { status: number; detail: string };
      setStage("choose");
      setLoaded(0);
      setError(
        status === -1
          ? { message: "Upload cancelled. Nothing was saved. Your file is still selected." }
          : explain(status, detail)
      );
      return;
    }

    setStage("saving");
    setAnnounce("Upload finished. Saving lecture.");
    const { error: dbError } = await supabase
      .from("lectures")
      .insert({ user_id: session.user.id, title: cleanTitle, audio_url: path });
    if (dbError) {
      await supabase.storage.from(LECTURE_BUCKET).remove([path]); // don't leave an orphaned file
      setStage("choose");
      setLoaded(0);
      setError({
        message: "The recording uploaded but the lecture could not be saved, so we removed it. Try again.",
        detail: dbError.message,
      });
      return;
    }

    setStage("done");
    setAnnounce("Lecture saved.");
    router.refresh();
  }

  if (stage === "done" && picked) {
    return (
      <div className="rounded-lg border-2 border-success bg-surface p-5" role="status">
        <h2 className="text-2xl font-semibold text-success">Lecture saved</h2>
        <p className="mt-2">
          <strong>{title.trim()}</strong> ({formatBytes(picked.file.size)}) is in your library.
          Transcripts and study material come in a later step.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/dashboard" className={primaryBtn}>Go to your lectures</Link>
          <button
            type="button"
            className={outlineBtn}
            onClick={() => {
              setStage("choose");
              setPicked(null);
              setTitle("");
              setLoaded(0);
              setAnnounce("");
            }}
          >
            Upload another lecture
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div
        onDragEnter={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          choose(e.dataTransfer.files);
        }}
        onClick={() => { if (!busy && !picked) inputRef.current?.click(); }}
        className={`rounded-lg border-2 border-accent p-5 text-center transition-colors ${
          dragging ? "border-solid bg-surface" : "border-dashed bg-background"
        } ${!picked && !busy ? "cursor-pointer" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => choose(e.target.files)}
        />

        {picked ? (
          <div className="text-left">
            <p className="font-bold break-words">{picked.file.name}</p>
            <p>
              {picked.ext.toUpperCase()} · {formatBytes(picked.file.size)}
            </p>
            {!busy && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); clearFile(); }}
                className="mt-2 font-bold text-accent underline underline-offset-4"
              >
                Choose a different file
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="font-heading text-2xl font-semibold">
              {dragging ? "Drop to add this recording" : "Drag a lecture recording here"}
            </p>
            <p className="mt-2">or</p>
            <button type="button" className={`${outlineBtn} mt-2`}>Choose a file</button>
            <p className="mt-3 text-sm">
              {FORMATS_LABEL}. Up to {formatBytes(MAX_BYTES)}.
            </p>
          </>
        )}
      </div>

      <div>
        <label htmlFor="title" className="font-bold">Lecture title</label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_TITLE}
          disabled={busy}
          placeholder="For example, Statistics week 4: regression"
          className="mt-1 block w-full rounded-md border-2 border-border bg-surface px-3 py-2 text-ink disabled:opacity-60"
        />
      </div>

      {busy && picked && (
        <div>
          <div className="flex items-baseline justify-between gap-3 font-bold">
            <span>{stage === "saving" ? "Saving lecture…" : "Uploading…"}</span>
            <span>
              {percent}% · {formatBytes(Math.min(loaded, picked.file.size))} of {formatBytes(picked.file.size)}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="mt-2 h-3 overflow-hidden rounded-full border-2 border-accent bg-surface"
          >
            <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      <div aria-live="assertive">
        {error && (
          <div role="alert" className="rounded-md border-2 border-error bg-surface px-3 py-2">
            <p className="font-bold text-error">Problem: {error.message}</p>
            {error.detail && <p className="mt-1 text-sm">Details: {error.detail}</p>}
            {/session has ended/.test(error.message) && (
              <Link href="/login" className="mt-1 inline-block font-bold text-accent underline underline-offset-4">
                Go to sign in
              </Link>
            )}
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{announce}</p>

      <div className="flex flex-wrap gap-3">
        {stage === "uploading" ? (
          <button type="button" className={outlineBtn} onClick={() => xhrRef.current?.abort()}>
            Cancel upload
          </button>
        ) : (
          <button type="submit" disabled={!picked || busy} className={primaryBtn}>
            {stage === "saving" ? "Saving…" : "Upload lecture"}
          </button>
        )}
        {!busy && (
          <Link href="/dashboard" className={outlineBtn}>Back to your lectures</Link>
        )}
      </div>
    </form>
  );
}
