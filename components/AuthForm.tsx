"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PROFILES, type DisabilityProfile } from "@/lib/profiles";

const field =
  "mt-1 block w-full rounded-md border-2 border-border bg-surface px-3 py-2 text-ink";
const primaryBtn =
  "w-full rounded-md bg-primary px-4 py-3 font-bold text-surface transition-colors hover:bg-primary-dark disabled:opacity-60";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<DisabilityProfile>("dyslexia");
  const isSignup = mode === "signup";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const supabase = createClient();

    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { disability_profile: profile } },
      });
      if (error) setError(error.message);
      else if (!data.session)
        setNotice("Account created. Check your email for a confirmation link, then sign in.");
      else {
        router.push("/dashboard");
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else {
        router.push("/dashboard");
        router.refresh();
      }
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h2 className="text-3xl font-semibold">
        {isSignup ? "Create your account" : "Sign in"}
      </h2>

      <div>
        <label htmlFor="email" className="font-bold">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className={field} />
      </div>
      <div>
        <label htmlFor="password" className="font-bold">Password</label>
        <input
          id="password" name="password" type="password" required minLength={6}
          autoComplete={isSignup ? "new-password" : "current-password"} className={field}
        />
        {isSignup && <p className="mt-1 text-sm">At least 6 characters.</p>}
      </div>

      {isSignup && (
        <fieldset>
          <legend className="font-bold">How should we shape your study material?</legend>
          <div className="mt-2 space-y-2">
            {PROFILES.map((p) => {
              const selected = profile === p.value;
              return (
                <label
                  key={p.value}
                  className={`flex cursor-pointer gap-3 rounded-md border-2 p-3 transition-colors focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-accent ${
                    selected ? "border-accent bg-background" : "border-border bg-surface"
                  }`}
                >
                  <input
                    type="radio" name="profile" value={p.value} checked={selected}
                    onChange={() => setProfile(p.value)} className="mt-1 h-4 w-4 accent-accent"
                  />
                  <span>
                    <span className="block font-bold">
                      {p.label}
                      {selected && <span className="ml-2 text-accent">Selected</span>}
                    </span>
                    <span className="block text-sm">{p.blurb}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div aria-live="polite">
        {error && (
          <p role="alert" className="rounded-md border-2 border-error px-3 py-2 font-bold text-error">
            Error: {error}
          </p>
        )}
        {notice && (
          <p className="rounded-md border-2 border-success px-3 py-2 font-bold text-success">
            {notice}
          </p>
        )}
      </div>

      <button type="submit" disabled={busy} className={primaryBtn}>
        {busy ? "Working…" : isSignup ? "Create account" : "Sign in"}
      </button>

      <p>
        {isSignup ? "Already have an account? " : "New here? "}
        <Link href={isSignup ? "/login" : "/signup"} className="font-bold text-accent underline underline-offset-4">
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
