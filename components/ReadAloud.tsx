"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ReadAloudSection } from "@/lib/read-aloud";
import { SessionEndedError, useExplainError } from "@/lib/client-errors";

type Phase = "idle" | "loading" | "playing" | "paused" | "finished" | "failed";

// Only one section speaks at a time: a starting player tells the others to pause.
const PLAY_EVENT = "ab-readaloud-play";

const btn = "btn btn-sm btn-outline";

const icon = { "aria-hidden": true, width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 2.5 } as const;

export default function ReadAloud({
  lectureId,
  section,
  label,
}: {
  lectureId: string;
  section: ReadAloudSection;
  /** Names the section in button labels, e.g. "summary". */
  label: string;
}) {
  const t = useTranslations("ReadAloud");
  const tc = useTranslations("Common");
  const te = useTranslations("Errors");
  const explain = useExplainError();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [hadAudio, setHadAudio] = useState(false);

  const say = (text: string) => setAnnounce(text);

  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== section) audioRef.current?.pause();
    };
    window.addEventListener(PLAY_EVENT, onOther);
    return () => window.removeEventListener(PLAY_EVENT, onOther);
  }, [section]);

  async function fetchAudio(): Promise<string> {
    const res = await fetch(`/api/lectures/${lectureId}/read-aloud`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section }),
    });
    const type = res.headers.get("content-type") ?? "";
    if (res.redirected || !type.includes("application/json")) {
      throw new SessionEndedError();
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? te("generic"));
    return data.url as string;
  }

  function fail(message: string) {
    setPhase("failed");
    setProblem(message);
    say(t("announceFailed", { label, message }));
  }

  async function play(el: HTMLAudioElement) {
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: section }));
    try {
      await el.play();
    } catch (err) {
      // Some browsers refuse to start sound after a network wait. The audio is ready, so ask for one more press.
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setPhase("paused");
        say(t("announceReady", { label }));
      } else {
        fail(t("cantPlayDevice"));
      }
    }
  }

  async function onPress() {
    const el = audioRef.current;
    if (!el || phase === "loading") return;
    if (phase === "playing") return el.pause();

    setProblem(null);
    if (src && phase !== "failed") {
      if (phase === "finished") el.currentTime = 0;
      return void play(el);
    }

    setPhase("loading");
    say(t("announceLoading", { label }));
    try {
      const url = await fetchAudio();
      setSrc(url);
      setHadAudio(true);
      // Wait for the element to take the new source before playing.
      el.src = url;
      el.load();
      await play(el);
    } catch (err) {
      fail(explain(err));
    }
  }

  function startOver() {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    void play(el);
  }

  const buttonText = t(phase);
  const buttonLabel = t(
    phase === "idle" ? "ariaIdle" : phase === "failed" ? "ariaFailed" : phase === "finished" ? "ariaFinished" : phase === "loading" ? "ariaLoading" : phase === "playing" ? "ariaPlaying" : "ariaPaused",
    { label }
  );
  const stateText =
    phase === "loading" ? t("stateLoading") : phase === "playing" ? t("statePlaying") : phase === "paused" ? t("statePaused") : phase === "finished" ? t("stateFinished") : "";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onPress} aria-disabled={phase === "loading"} aria-label={buttonLabel} className={btn}>
          {phase === "loading" ? (
            <svg {...icon} className="animate-spin"><path d="M8 2a6 6 0 1 0 6 6" /></svg>
          ) : phase === "playing" ? (
            <svg {...icon}><path d="M5 3v10 M11 3v10" /></svg>
          ) : (
            <svg {...icon}><path d="M5 3l8 5-8 5z" /></svg>
          )}
          {buttonText}
        </button>

        {hadAudio && (phase === "playing" || phase === "paused") && (
          <button type="button" onClick={startOver} aria-label={t("startOverLabel", { label })} className={btn}>
            <svg {...icon}><path d="M3 8a5 5 0 1 0 1.8-3.8 M3 2.5v3h3" /></svg>
            {t("startOver")}
          </button>
        )}

        {phase !== "failed" && phase !== "idle" && (
          <span className="chip border-accent text-accent">
            {stateText}
          </span>
        )}
      </div>

      {problem && (
        <p
          role="alert"
          className="callout-error mt-2 inline-flex max-w-prose items-start gap-2"
        >
          <svg {...icon} className="mt-1 shrink-0"><path d="M8 2l6.5 12h-13z M8 6.5v3.5 M8 12v.5" /></svg>
          <span>{tc("problem", { message: problem })}</span>
        </p>
      )}

      {/* Always in the page so a change of text is announced. */}
      <p role="status" className="sr-only">{announce}</p>

      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => { setPhase("playing"); say(t("announcePlaying", { label })); }}
        onPause={() => {
          const el = audioRef.current;
          // "pause" also fires when playback reaches the end; "ended" handles that case.
          if (el && !el.ended) { setPhase((p) => (p === "playing" ? "paused" : p)); say(t("announcePaused", { label })); }
        }}
        onEnded={() => { setPhase("finished"); say(t("announceFinished", { label })); }}
        onError={() => {
          // Most often the one-hour link has expired. Forget it so the next press asks for a fresh one.
          setSrc(null);
          if (audioRef.current?.getAttribute("src")) fail(t("cantPlay"));
        }}
      />
    </div>
  );
}
