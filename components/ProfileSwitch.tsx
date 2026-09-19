"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PROFILES, type DisabilityProfile } from "@/lib/profiles";

const outlineBtn =
  "rounded-md border-2 border-accent px-3 py-2 font-bold text-accent hover:bg-accent hover:text-surface aria-disabled:opacity-60";
const primaryBtn =
  "rounded-md bg-primary-dark px-4 py-3 font-bold text-surface transition-colors hover:bg-ink aria-disabled:opacity-60";

export default function ProfileSwitch({ current }: { current: DisabilityProfile | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<DisabilityProfile | null>(current);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const openBtn = useRef<HTMLButtonElement>(null);
  const firstRadio = useRef<HTMLInputElement>(null);

  const label = PROFILES.find((p) => p.value === current)?.label ?? "Not set";

  function show() {
    setChoice(current);
    setProblem(null);
    setOpen(true);
    setTimeout(() => firstRadio.current?.focus(), 0);
  }

  function close(message: string) {
    setOpen(false);
    setAnnounce(message);
    setTimeout(() => openBtn.current?.focus(), 0);
  }

  async function save() {
    if (saving) return;
    if (!choice || choice === current) return close("Study profile unchanged.");
    setSaving(true);
    setProblem(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: choice }),
      });
      const type = res.headers.get("content-type") ?? "";
      if (res.redirected || !type.includes("application/json")) throw new Error("Your session has ended. Sign in again, then retry.");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
      const next = PROFILES.find((p) => p.value === choice)!.label;
      close(`Study profile changed to ${next}.`);
      router.refresh();
    } catch (err) {
      setProblem(
        err instanceof TypeError
          ? "The request didn’t go through because the connection dropped. Check your internet, then try again."
          : (err as Error).message
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-prose">
      <p role="status" className="sr-only">{announce}</p>

      {!open && (
        <button ref={openBtn} type="button" onClick={show} className={`${outlineBtn} mt-3`}>
          Change study profile
        </button>
      )}

      {open && (
        <fieldset className="mt-3 rounded-md border-2 border-accent bg-surface p-3">
          <legend className="px-1 font-bold">Study profile (now: {label})</legend>
          <p>
            New study material will follow the profile you choose. Material you already made keeps its old shape until you
            press “Make study material again” on that lecture.
          </p>
          <div className="mt-3 space-y-2">
            {PROFILES.map((p, i) => {
              const selected = choice === p.value;
              return (
                <label
                  key={p.value}
                  className={`flex cursor-pointer gap-3 rounded-md border-2 p-3 transition-colors focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-accent ${
                    selected ? "border-accent bg-background ring-2 ring-accent" : "border-accent bg-surface"
                  }`}
                >
                  <input
                    ref={i === 0 ? firstRadio : undefined}
                    type="radio"
                    name="study-profile"
                    value={p.value}
                    checked={selected}
                    onChange={() => setChoice(p.value)}
                    className="mt-1 h-4 w-4 accent-accent"
                  />
                  <span>
                    <span className="block font-bold">{p.label}</span>
                    <span className="block">{p.blurb}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {problem && (
            <p role="alert" className="mt-3 rounded-md border-2 border-error bg-surface px-2 py-1 font-bold text-error">
              Problem: {problem}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} aria-disabled={saving} className={primaryBtn}>
              {saving ? "Saving…" : "Save study profile"}
            </button>
            <button type="button" onClick={() => !saving && close("Study profile unchanged.")} className={outlineBtn}>
              Cancel
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
