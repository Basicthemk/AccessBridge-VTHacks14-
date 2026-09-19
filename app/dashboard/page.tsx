import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PROFILES, type DisabilityProfile } from "@/lib/profiles";
import AppHeader from "@/components/AppHeader";
import ProfileSwitch from "@/components/ProfileSwitch";
import TranscriptStatus from "@/components/TranscriptStatus";
import { transcriptState } from "@/lib/transcript-status";

export const metadata = { title: "Your lectures · AccessBridge" };
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The profiles table is the source of truth: it is what the app uses and what can be changed here.
  const { data: profileRow } = user
    ? await supabase.from("profiles").select("disability_profile").eq("id", user.id).maybeSingle()
    : { data: null };
  const profileValue = (profileRow?.disability_profile ?? null) as DisabilityProfile | null;
  const profile = PROFILES.find((p) => p.value === profileValue);

  const { data: lectures, error } = await supabase
    .from("lectures")
    .select("id, title, transcript, transcript_status, transcript_error, transcript_started_at, created_at")
    .order("created_at", { ascending: false });

  return (
    <>
      <AppHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-3 pb-6 pt-5 md:px-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-4xl font-semibold">Your lectures</h1>
          <p className="mt-2">
            Signed in as <strong>{user?.email}</strong>. Study profile:{" "}
            <strong>{profile?.label ?? "Not set"}</strong>.
          </p>
          <ProfileSwitch current={profileValue} />
        </div>
        <Link
          href="/upload"
          className="rounded-md bg-primary-dark px-4 py-3 font-bold text-surface transition-colors hover:bg-ink"
        >
          Upload a lecture
        </Link>
      </div>

      {error && (
        <p role="alert" className="mt-5 rounded-md border-2 border-error bg-surface px-3 py-2 font-bold text-error">
          Problem: We couldn’t load your lectures. Refresh the page to try again.
        </p>
      )}

      {!error && lectures?.length === 0 && (
        <section className="mt-5 rounded-lg border-2 border-dashed border-accent p-5">
          <h2 className="text-2xl font-semibold">No lectures yet</h2>
          <p className="mt-2 max-w-prose">
            Upload your first recording to start building your library.
          </p>
          <Link
            href="/upload"
            className="mt-3 inline-block rounded-md border-2 border-accent px-4 py-3 font-bold text-accent hover:bg-accent hover:text-surface"
          >
            Upload a lecture
          </Link>
        </section>
      )}

      {lectures && lectures.length > 0 && (
        <ul className="mt-5 space-y-3">
          {lectures.map((l) => (
            <li
              key={l.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-surface p-4"
            >
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">
                  <Link href={`/lectures/${l.id}`} className="text-accent underline underline-offset-4 hover:text-primary-dark">
                    {l.title}
                  </Link>
                </h2>
                <p className="text-sm">
                  Uploaded{" "}
                  {new Date(l.created_at).toLocaleDateString("en-US", {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  })}
                </p>
              </div>
              <TranscriptStatus lectureId={l.id} state={transcriptState(l)} title={l.title} />
            </li>
          ))}
        </ul>
      )}
    </main>
    </>
  );
}
