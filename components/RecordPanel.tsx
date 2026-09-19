"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatBytes } from "@/lib/upload";
import {
  RECORDING_BITS_PER_SECOND,
  RECORDING_STOP_BYTES,
  extensionForRecording,
  formatClock,
  pickRecorderMime,
  recordingSupport,
  spokenDuration,
} from "@/lib/record";

type Phase = "idle" | "requesting" | "recording" | "paused" | "review" | "confirmed" | "error";
type Problem = { message: string; help?: string };
type Recorded = { blob: Blob; ext: string; seconds: number; url: string };

type Props = {
  /** True while the form is uploading, so the controls lock. */
  locked: boolean;
  /** The student chose to use the recording; it now goes through the same upload path as a file. */
  onConfirm: (file: File) => void;
  /** The confirmed recording was discarded. */
  onDiscard: () => void;
  /** True while the microphone is open (recording or paused), so the parent can guard leaving. */
  onActiveChange: (active: boolean) => void;
};

function describeError(err: unknown): Problem {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return {
      message: "Microphone access is blocked, so nothing was recorded.",
      help: "Allow the microphone for this site in your browser’s address-bar or site settings, then choose Try again. You can also switch to Upload a file.",
    };
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return {
      message: "No microphone was found on this device.",
      help: "Plug in or turn on a microphone, then choose Try again. You can also switch to Upload a file.",
    };
  if (name === "NotReadableError" || name === "AbortError")
    return {
      message: "The microphone could not be started. Another app or tab may be using it.",
      help: "Close anything else that uses the microphone, then choose Try again.",
    };
  return {
    message: "Recording could not start because of an unexpected problem.",
    help: "Choose Try again. If it keeps failing, use Upload a file instead.",
  };
}

function MicIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}
function RecDot() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="8" r="6" />
    </svg>
  );
}
function PauseBars() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="3" y="2" width="4" height="12" rx="1" />
      <rect x="9" y="2" width="4" height="12" rx="1" />
    </svg>
  );
}

export default function RecordPanel({ locked, onConfirm, onDiscard, onActiveChange }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const [micState, setMicState] = useState<PermissionState | "unknown">("unknown");
  const [announce, setAnnounce] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bytesRef = useRef(0);
  const clockRef = useRef({ before: 0, since: 0 }); // seconds banked before the current run, and when it began
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const mainBtnRef = useRef<HTMLButtonElement>(null);
  const urlRef = useRef<string | null>(null);
  const stopReasonRef = useRef("");

  const support = recordingSupport();
  const active = phase === "recording" || phase === "paused";

  useEffect(() => { onActiveChange(active); }, [active, onActiveChange]);

  // Read the current permission where the browser allows it. Safari and older Firefox throw; that is fine.
  useEffect(() => {
    let status: PermissionStatus | undefined;
    const update = () => status && setMicState(status.state);
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((s) => {
        status = s;
        update();
        s.addEventListener("change", update);
      })
      .catch(() => {});
    return () => status?.removeEventListener("change", update);
  }, []);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Leaving the page or tab closes the microphone and frees the preview URL.
  useEffect(() => {
    return () => {
      const r = recorderRef.current;
      if (r && r.state !== "inactive") {
        r.onstop = null;
        r.stop();
      }
      releaseMic();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [releaseMic]);

  // Tick the visible timer. Elapsed time excludes paused stretches.
  useEffect(() => {
    if (phase !== "recording") return;
    const tick = () => setElapsed(clockRef.current.before + (performance.now() - clockRef.current.since) / 1000);
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [phase]);

  // Spoken progress once a minute, never every second.
  const minutes = Math.floor(elapsed / 60);
  useEffect(() => {
    if (phase === "recording" && minutes > 0) setAnnounce(`Recording, ${spokenDuration(minutes * 60)} so far.`);
  }, [minutes, phase]);

  // The button that had focus disappears when review starts, so send focus to the review heading.
  useEffect(() => {
    if (phase === "review") reviewHeadingRef.current?.focus();
  }, [phase]);

  function bankElapsed(): number {
    const c = clockRef.current;
    const total = c.before + (c.since ? (performance.now() - c.since) / 1000 : 0);
    c.before = total;
    c.since = 0;
    return total;
  }

  async function start() {
    if (locked || phase === "requesting") return;
    setProblem(null);
    setNotice("");
    setPhase("requesting");
    setAnnounce("Requesting microphone access. Your browser may ask for permission.");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setProblem(describeError(err));
      setPhase("error");
      setAnnounce("Microphone unavailable.");
      return;
    }

    try {
      const mime = pickRecorderMime();
      const recorder = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        audioBitsPerSecond: RECORDING_BITS_PER_SECOND,
      });
      chunksRef.current = [];
      bytesRef.current = 0;
      stopReasonRef.current = "";
      recorder.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        chunksRef.current.push(e.data);
        bytesRef.current += e.data.size;
        if (bytesRef.current >= RECORDING_STOP_BYTES && recorder.state !== "inactive") {
          stopReasonRef.current = `Recording stopped by itself at the ${formatBytes(RECORDING_STOP_BYTES)} size limit. Everything up to that point is kept.`;
          recorder.stop();
        }
      };
      recorder.onerror = () => {
        stopReasonRef.current = "The recording was interrupted. What was captured so far is kept.";
        if (recorder.state !== "inactive") recorder.stop();
      };
      recorder.onstop = () => finish(recorder);
      // If the microphone is unplugged or revoked mid-recording, keep what we have.
      stream.getAudioTracks().forEach((t) => {
        t.onended = () => {
          if (recorder.state === "inactive") return;
          stopReasonRef.current = "The microphone stopped working, so the recording ended. What was captured so far is kept.";
          recorder.stop();
        };
      });

      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.start(1000); // a chunk each second, so the size limit can be enforced live
      clockRef.current = { before: 0, since: performance.now() };
      setElapsed(0);
      setPhase("recording");
      setAnnounce("Recording started.");
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      setProblem(
        (err as { name?: string })?.name === "NotSupportedError"
          ? { message: "This browser can’t record audio in a format we can use.", help: "Try a current version of Chrome, Edge, Firefox or Safari, or use Upload a file." }
          : describeError(err)
      );
      setPhase("error");
    }
  }

  function finish(recorder: MediaRecorder) {
    const seconds = bankElapsed();
    releaseMic();
    recorderRef.current = null;
    const type = recorder.mimeType || chunksRef.current[0]?.type || "";
    const ext = extensionForRecording(type);
    const blob = new Blob(chunksRef.current, { type: type.split(";")[0] });
    chunksRef.current = [];
    if (blob.size === 0) {
      setProblem({ message: "Nothing was captured. The recording is empty.", help: "Choose Try again and speak for a few seconds before stopping." });
      setPhase("error");
      return;
    }
    if (!ext) {
      setProblem({
        message: `This browser recorded in a format we can’t accept (${type || "unknown"}).`,
        help: "Try a current version of Chrome, Edge, Firefox or Safari, or use Upload a file.",
      });
      setPhase("error");
      return;
    }
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    setRecorded({ blob, ext, seconds, url });
    setNotice(stopReasonRef.current);
    setPhase("review");
    setAnnounce(`Recording stopped. ${spokenDuration(seconds)} recorded. Play it back, then use it or record again.`);
  }

  function stop() {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
  }

  function togglePause() {
    const r = recorderRef.current;
    if (!r) return;
    if (r.state === "recording") {
      r.pause();
      bankElapsed();
      setElapsed(clockRef.current.before);
      setPhase("paused");
      setAnnounce("Recording paused.");
    } else if (r.state === "paused") {
      r.resume();
      clockRef.current.since = performance.now();
      setPhase("recording");
      setAnnounce("Recording resumed.");
    }
  }

  function clearRecording() {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setRecorded(null);
    setElapsed(0);
    setNotice("");
  }

  function discard() {
    const wasConfirmed = phase === "confirmed";
    clearRecording();
    setPhase("idle");
    setAnnounce("Recording discarded. You can record again.");
    if (wasConfirmed) onDiscard();
    setTimeout(() => mainBtnRef.current?.focus(), 0);
  }

  function confirm() {
    if (!recorded) return;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    const file = new File([recorded.blob], `lecture-recording-${stamp}.${recorded.ext}`, { type: recorded.blob.type });
    setPhase("confirmed");
    setAnnounce("Recording ready. Add a title and choose Upload lecture.");
    onConfirm(file);
  }

  if (support !== "ok") {
    return (
      <div role="alert" className="rounded-md border-2 border-error bg-surface px-3 py-2">
        <p className="font-bold text-error">
          Problem: {support === "insecure"
            ? "Recording needs a secure (https) connection, and this page isn’t on one."
            : "This browser can’t record audio."}
        </p>
        <p className="mt-1">
          {support === "insecure"
            ? "Open AccessBridge at its https address to record."
            : "Try a current version of Chrome, Edge, Firefox or Safari."}{" "}
          You can still use Upload a file.
        </p>
      </div>
    );
  }

  const status: { label: string; icon?: React.ReactNode; tone: string } | null =
    phase === "recording"
      ? { label: "Recording in progress", icon: <RecDot />, tone: "border-error text-error" }
      : phase === "paused"
      ? { label: "Recording paused", icon: <PauseBars />, tone: "border-accent text-accent" }
      : phase === "requesting"
      ? { label: "Waiting for microphone permission", tone: "border-accent text-accent" }
      : null;

  return (
    <div className="space-y-4">
      <p className="sr-only" aria-live="polite">{announce}</p>

      {(phase === "idle" || phase === "requesting" || active || phase === "error") && (
        <div className="text-center">
          {phase === "idle" && (
            <p className="mb-4">
              {micState === "granted"
                ? "Microphone access: already allowed for this site. Nothing records until you choose Start recording."
                : micState === "denied"
                ? "Microphone access: blocked in your browser settings. Allow it for this site, then choose Start recording."
                : "Microphone access: not asked for yet. Your browser will ask for permission when you choose Start recording."}
            </p>
          )}
          {phase === "requesting" && (
            <p className="mb-4" role="status">Requesting microphone access. Choose Allow in the browser’s permission prompt.</p>
          )}

          {status && (
            <p className={`chip mb-4 bg-surface ${status.tone}`}>
              {status.icon}
              <span>{status.label}</span>
            </p>
          )}

          {active && (
            <p className="mb-4 font-heading text-5xl font-semibold tabular-nums" role="timer" aria-live="off" aria-label={`Elapsed ${spokenDuration(elapsed)}`}>
              <span aria-hidden="true">{formatClock(elapsed)}</span>
            </p>
          )}

          {phase !== "error" && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                ref={mainBtnRef}
                type="button"
                className="btn btn-primary min-w-[16rem] px-8 py-5 text-xl"
                aria-disabled={phase === "requesting" || locked}
                onClick={() => (active ? stop() : start())}
              >
                {active ? <StopIcon /> : <MicIcon />}
                {active ? "Stop recording" : phase === "requesting" ? "Requesting microphone…" : "Start recording"}
              </button>
              {active && (
                <button type="button" className="btn btn-outline px-6 py-5 text-xl" onClick={togglePause}>
                  {phase === "paused" ? "Resume recording" : "Pause recording"}
                </button>
              )}
            </div>
          )}
          {active && (
            <p className="mt-3 text-sm">
              Keep this tab open while you record. Stopping lets you play the recording back before anything is uploaded.
            </p>
          )}
        </div>
      )}

      {phase === "error" && problem && (
        <div role="alert" className="rounded-md border-2 border-error bg-surface px-3 py-2">
          <p className="font-bold text-error">Problem: {problem.message}</p>
          {problem.help && <p className="mt-1">{problem.help}</p>}
          <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => { setProblem(null); setPhase("idle"); }}>
            Try again
          </button>
        </div>
      )}

      {(phase === "review" || phase === "confirmed") && recorded && (
        <div>
          <h2
            ref={reviewHeadingRef}
            tabIndex={-1}
            className="text-2xl font-semibold"
          >
            {phase === "confirmed" ? "Recording ready to upload" : "Review your recording"}
          </h2>
          <p className="mt-1 flex flex-wrap gap-x-3">
            <span className="font-bold">Length {formatClock(recorded.seconds)}</span>
            <span>{formatBytes(recorded.blob.size)}</span>
            <span>{recorded.ext === "weba" ? "WEBM" : recorded.ext.toUpperCase()}</span>
          </p>
          {notice && <p className="mt-2 font-bold" role="status">Note: {notice}</p>}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the student's own voice; the transcript is what this app produces */}
          <audio controls src={recorded.url} className="mt-3 w-full" aria-label="Playback of your recording" />
          <div className="mt-4 flex flex-wrap gap-3">
            {phase === "review" && (
              <button type="button" className="btn btn-primary" onClick={confirm}>
                Use this recording
              </button>
            )}
            <button type="button" className="btn btn-outline" onClick={discard} aria-disabled={locked} disabled={locked}>
              Discard and record again
            </button>
          </div>
          {phase === "review" && (
            <p className="mt-3 text-sm">Nothing is uploaded until you choose Use this recording, then Upload lecture.</p>
          )}
        </div>
      )}
    </div>
  );
}
