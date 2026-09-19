"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import RecordPanel from "@/components/RecordPanel";
import {
  ACCEPT_ATTR,
  LECTURE_BUCKET,
  MAX_BYTES,
  MAX_TITLE,
  checkFile,
  formatBytes,
  titleFromFilename,
} from "@/lib/upload";

type Stage = "choose" | "uploading" | "saving" | "done";
type Picked = { file: File; contentType: string; ext: string };
type Mode = "file" | "record";
type UploadError = { message: string; detail?: string; sessionEnded?: boolean };

const primaryBtn = "btn btn-primary";
const outlineBtn = "btn btn-outline";

export default function UploadForm() {
  const router = useRouter();
  const t = useTranslations("Upload");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [stage, setStage] = useState<Stage>("choose");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [announce, setAnnounce] = useState("");
  const [mode, setMode] = useState<Mode>("file");
  const [recordingActive, setRecordingActive] = useState(false);
  const tabRefs = useRef<Record<Mode, HTMLButtonElement | null>>({ file: null, record: null });

  const busy = stage === "uploading" || stage === "saving";
  const percent = picked ? Math.min(100, Math.round((loaded / picked.file.size) * 100)) : 0;

  // Warn before leaving mid-upload or mid-recording.
  useEffect(() => {
    if (!busy && !recordingActive) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, recordingActive]);

  function choose(files: FileList | null) {
    if (busy || !files || files.length === 0) return;
    setError(null);
    if (files.length > 1) {
      setError({ message: t("oneAtATime") });
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
    setTitle((prev) => prev.trim() || titleFromFilename(file.name));
  }

  function clearFile() {
    setPicked(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function switchMode(next: Mode) {
    if (busy || recordingActive || next === mode) return;
    clearFile();
    setMode(next);
  }

  function onTabKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next: Mode = e.key === "ArrowLeft" || e.key === "Home" ? "file" : "record";
    switchMode(next);
    tabRefs.current[next]?.focus();
  }

  // A recording joins the same state a chosen file does, so the upload below is the same code path.
  function useRecording(file: File) {
    const check = checkFile(file);
    if (!check.ok) {
      setError({ message: check.message });
      return;
    }
    setError(null);
    setPicked({ file, contentType: check.contentType, ext: check.ext });
    setTitle((prev) => prev.trim() || t("recordedTitle", { date: new Date().toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) }));
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
        setAnnounce(t("announceUploading", { percent: pct }));
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

  function explain(status: number, detail: string): UploadError {
    if (status === 0) return { message: t("errInterrupted") };
    if (status === 413) return { message: t("errTooLarge", { limit: formatBytes(MAX_BYTES) }) };
    if (status === 401 || status === 403) return { message: t("errSession"), detail, sessionEnded: true };
    if (status === 404 || /bucket not found/i.test(detail)) return { message: t("errStorage"), detail };
    return { message: t("errFailed"), detail: detail || t("errStatus", { status }) };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked || busy) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError({ message: t("errNoTitle") });
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
          ? { message: t("errCancelled") }
          : explain(status, detail)
      );
      return;
    }

    setStage("saving");
    setAnnounce(t("announceFinished"));
    const { error: dbError } = await supabase
      .from("lectures")
      .insert({ user_id: session.user.id, title: cleanTitle, audio_url: path });
    if (dbError) {
      await supabase.storage.from(LECTURE_BUCKET).remove([path]); // don't leave an orphaned file
      setStage("choose");
      setLoaded(0);
      setError({
        message: t("errSave"),
        detail: dbError.message,
      });
      return;
    }

    setStage("done");
    setAnnounce(t("announceSaved"));
    router.refresh();
  }

  if (stage === "done" && picked) {
    return (
      <div className="rounded-lg border-2 border-success bg-surface p-4 md:p-5" role="status">
        <h2 className="text-2xl font-semibold text-success">{t("doneTitle")}</h2>
        <p className="mt-2">
          {t.rich("doneBody", { title: title.trim(), size: formatBytes(picked.file.size), b: (chunks) => <strong>{chunks}</strong> })}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/dashboard" className={primaryBtn}>{t("goLectures")}</Link>
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
            {t("another")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div role="tablist" aria-label={t("tabsLabel")} className="flex flex-wrap gap-2" onKeyDown={onTabKey}>
        {(["file", "record"] as Mode[]).map((m) => (
          <button
            key={m}
            ref={(el) => { tabRefs.current[m] = el; }}
            type="button"
            role="tab"
            id={`tab-${m}`}
            aria-selected={mode === m}
            aria-controls={`panel-${m}`}
            aria-disabled={busy || recordingActive}
            tabIndex={mode === m ? 0 : -1}
            onClick={() => switchMode(m)}
            className={`btn ${mode === m ? "btn-primary" : "btn-outline"}`}
          >
            {m === "file" ? t("tabFile") : t("tabRecord")}
          </button>
        ))}
      </div>
      {recordingActive && (
        <p className="text-sm">{t("stopToSwitch")}</p>
      )}

      {mode === "file" && (
        <div role="tabpanel" id="panel-file" aria-labelledby="tab-file">
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
        className={`rounded-lg border-2 border-accent bg-surface p-5 transition-colors md:p-6 ${
          dragging ? "border-solid bg-background" : "border-dashed"
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
          <div>
            <p className="font-heading text-xl font-semibold break-words">{picked.file.name}</p>
            <p className="mt-1 flex flex-wrap gap-x-3">
              <span className="font-bold">{picked.ext.toUpperCase()}</span>
              <span>{formatBytes(picked.file.size)}</span>
            </p>
            {!busy && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); clearFile(); }}
                className="btn btn-quiet -ml-3 mt-2"
              >
                {t("chooseDifferent")}
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="font-heading text-2xl font-semibold text-balance">
              {dragging ? t("dropActive") : t("dropIdle")}
            </p>
            <p className="mt-3">{t("or")}</p>
            <button type="button" className={`${outlineBtn} mt-3`}>{t("chooseFile")}</button>
            <p className="mt-4 text-sm">
              {t("formats", { size: formatBytes(MAX_BYTES) })}
            </p>
          </>
        )}
      </div>
        </div>
      )}
      {mode === "record" && (
        <div role="tabpanel" id="panel-record" aria-labelledby="tab-record" className="rounded-lg border-2 border-accent bg-surface p-5 md:p-6">
          <RecordPanel
            locked={busy}
            onConfirm={useRecording}
            onDiscard={() => { setPicked(null); setError(null); }}
            onActiveChange={setRecordingActive}
          />
        </div>
      )}

      <div>
        <label htmlFor="title" className="font-bold">{t("titleLabel")}</label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_TITLE}
          disabled={busy}
          placeholder={t("titlePlaceholder")}
          className="field"
        />
      </div>

      {busy && picked && (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 font-bold">
            <span>{stage === "saving" ? t("savingLecture") : t("uploading")}</span>
            <span className="flex flex-wrap gap-x-3">
              <span>{percent}%</span>
              <span>
                {t("loadedOf", { loaded: formatBytes(Math.min(loaded, picked.file.size)), total: formatBytes(picked.file.size) })}
              </span>
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={t("progress")}
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
            <p className="font-bold text-error">{tc("problem", { message: error.message })}</p>
            {error.detail && <p className="mt-1 text-sm">{t("details", { detail: error.detail })}</p>}
            {error.sessionEnded && (
              <Link href="/login" className="mt-2 inline-block font-bold text-accent underline underline-offset-4">
                {t("goSignIn")}
              </Link>
            )}
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{announce}</p>

      <div className="flex flex-wrap items-center gap-3">
        {stage === "uploading" ? (
          <button type="button" className={outlineBtn} onClick={() => xhrRef.current?.abort()}>
            {t("cancel")}
          </button>
        ) : (
          <button type="submit" disabled={!picked || busy} className={primaryBtn}>
            {stage === "saving" ? t("savingBtn") : t("submit")}
          </button>
        )}
        {!busy && (
          <Link href="/dashboard" className="btn btn-quiet">{tc("backToLectures")}</Link>
        )}
      </div>
    </form>
  );
}
