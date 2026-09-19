"use client";

import { useEffect, useRef, useState } from "react";
import type { ReadAloudSection } from "@/lib/read-aloud";

type Phase = "idle" | "loading" | "playing" | "paused" | "finished" | "failed";

// Only one section speaks at a time: a starting player tells the others to pause.
const PLAY_EVENT = "ab-readaloud-play";

const btn =
  "inline-flex items-center gap-2 rounded-md border-2 border-accent px-3 py-2 font-bold text-accent hover:bg-accent hover:text-surface aria-disabled:opacity-60";

const icon = { "aria-hidden": true, width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 2.5 } as const;

const STATE_TEXT: Record<Exclude<Phase, "failed">, string> = {
  idle: "Ready",
  loading: "Loading audio. This can take a few seconds.",
  playing: "Playing",
  paused: "Paused",
  finished: "Finished",
};

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
      throw new Error("Your session has ended. Sign in again, then retry.");
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
    return data.url as string;
  }

  function fail(message: string) {
    setPhase("failed");
    setProblem(message);
    say(`Read aloud ${label} failed. ${message}`);
  }

  async function play(el: HTMLAudioElement) {
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: section }));
    try {
      await el.play();
    } catch (err) {
      // Some browsers refuse to start sound after a network wait. The audio is ready, so ask for one more press.
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setPhase("paused");
        say(`Audio for ${label} is ready. Choose Play to listen.`);
      } else {
        fail("We couldn’t play the audio on this device. Try again.");
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
    say(`Loading audio for ${label}. This can take a few seconds.`);
    try {
      const url = await fetchAudio();
      setSrc(url);
      setHadAudio(true);
      // Wait for the element to take the new source before playing.
      el.src = url;
      el.load();
      await play(el);
    } catch (err) {
      fail(
        err instanceof TypeError
          ? "The request didn’t go through because the connection dropped. Check your internet, then try again."
          : (err as Error).message
      );
    }
  }

  function startOver() {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    void play(el);
  }

  const buttonText =
    phase === "loading" ? "Loading…" : phase === "playing" ? "Pause" : phase === "paused" ? "Play" : phase === "finished" ? "Play again" : phase === "failed" ? "Try again" : "Read aloud";
  const buttonLabel = phase === "idle" || phase === "failed" || phase === "finished"
    ? `${buttonText}: ${label}`
    : `${buttonText} ${label}`;

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
          <button type="button" onClick={startOver} aria-label={`Start over ${label}`} className={btn}>
            <svg {...icon}><path d="M3 8a5 5 0 1 0 1.8-3.8 M3 2.5v3h3" /></svg>
            Start over
          </button>
        )}

        {phase !== "failed" && phase !== "idle" && (
          <span className="rounded-sm border-2 border-accent px-2 py-1 font-bold text-accent">
            {STATE_TEXT[phase]}
          </span>
        )}
      </div>

      {problem && (
        <p
          role="alert"
          className="mt-2 inline-flex max-w-prose items-start gap-2 rounded-md border-2 border-error bg-surface px-2 py-1 font-bold text-error"
        >
          <svg {...icon} className="mt-1 shrink-0"><path d="M8 2l6.5 12h-13z M8 6.5v3.5 M8 12v.5" /></svg>
          <span>Problem: {problem}</span>
        </p>
      )}

      {/* Always in the page so a change of text is announced. */}
      <p role="status" className="sr-only">{announce}</p>

      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => { setPhase("playing"); say(`Playing ${label}.`); }}
        onPause={() => {
          const el = audioRef.current;
          // "pause" also fires when playback reaches the end; "ended" handles that case.
          if (el && !el.ended) { setPhase((p) => (p === "playing" ? "paused" : p)); say(`Paused ${label}.`); }
        }}
        onEnded={() => { setPhase("finished"); say(`Finished reading ${label}.`); }}
        onError={() => {
          // Most often the one-hour link has expired. Forget it so the next press asks for a fresh one.
          setSrc(null);
          if (audioRef.current?.getAttribute("src")) fail("The audio couldn’t be played. Try again.");
        }}
      />
    </div>
  );
}
