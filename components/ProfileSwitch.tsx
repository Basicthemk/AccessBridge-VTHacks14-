"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PROFILES, type DisabilityProfile } from "@/lib/profiles";
import { SessionEndedError, useExplainError } from "@/lib/client-errors";

const outlineBtn = "btn btn-outline";
const primaryBtn = "btn btn-primary";

export default function ProfileSwitch({ current }: { current: DisabilityProfile | null }) {
  const router = useRouter();
  const t = useTranslations("ProfileSwitch");
  const tp = useTranslations("Profiles");
  const te = useTranslations("Errors");
  const tc = useTranslations("Common");
  const explain = useExplainError();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<DisabilityProfile | null>(current);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const openBtn = useRef<HTMLButtonElement>(null);
  const firstRadio = useRef<HTMLInputElement>(null);

  const label = current ? tp(`${current}.label`) : "—";

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
    if (!choice || choice === current) return close(t("unchanged"));
    setSaving(true);
    setProblem(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: choice }),
      });
      const type = res.headers.get("content-type") ?? "";
      if (res.redirected || !type.includes("application/json")) throw new SessionEndedError();
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? te("generic"));
      close(t("changed", { label: tp(`${choice}.label`) }));
      router.refresh();
    } catch (err) {
      setProblem(explain(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-prose">
      <p role="status" className="sr-only">{announce}</p>

      {!open && (
        <button ref={openBtn} type="button" onClick={show} className="btn btn-quiet -ml-3 mt-2">
          {t("change")}
        </button>
      )}

      {open && (
        <fieldset className="mt-3 rounded-lg border border-border bg-surface p-3">
          {/* Floated so a legend that wraps on a narrow screen sits inside the box instead of straddling its top border. */}
          <legend className="float-left w-full font-bold">{t("legend", { label })}</legend>
          <p className="clear-both pt-2">
            {t("note")}
          </p>
          <div className="mt-3 space-y-2">
            {PROFILES.map((p, i) => {
              const selected = choice === p.value;
              return (
                <label
                  key={p.value}
                  className={`flex cursor-pointer gap-3 rounded-md border-2 p-3 transition-colors focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-accent ${
                    selected ? "border-accent bg-background" : "border-border bg-surface hover:border-accent"
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
                    <span className="block font-bold">{tp(`${p.value}.label`)}</span>
                    <span className="mt-1 block text-sm">{tp(`${p.value}.blurb`)}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {problem && (
            <p role="alert" className="callout-error mt-3">
              {tc("problem", { message: problem })}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} aria-disabled={saving} className={primaryBtn}>
              {saving ? t("saving") : t("save")}
            </button>
            <button type="button" onClick={() => !saving && close(t("unchanged"))} className={outlineBtn}>
              {t("cancel")}
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
