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
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-3 pb-7 pt-6 md:px-5">
      <div className="split gap-y-5">
        <div className="split-side">
          <h1 className="text-4xl font-semibold text-balance">Your lectures</h1>
          <Link href="/upload" className="btn btn-primary mt-4">
            Upload a lecture
          </Link>
          <div className="mt-5 border-t border-border pt-4">
            <p>
              Signed in as <strong>{user?.email}</strong>. Study profile:{" "}
              <strong>{profile?.label ?? "Not set"}</strong>.
            </p>
            <ProfileSwitch current={profileValue} />
          </div>
        </div>

        <div className="split-main">
          {error && (
            <p role="alert" className="callout-error">
              Problem: We couldn’t load your lectures. Refresh the page to try again.
            </p>
          )}

          {!error && lectures?.length === 0 && (
            <section className="rounded-lg border-2 border-dashed border-accent p-5">
              <h2 className="text-2xl font-semibold">No lectures yet</h2>
              <p className="mt-2 max-w-prose">
                Upload your first recording to start building your library.
              </p>
              <Link href="/upload" className="btn btn-outline mt-4">
                Upload a lecture
              </Link>
            </section>
          )}

          {lectures && lectures.length > 0 && (
            <ul className="border-b border-border">
              {lectures.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-t border-border py-4"
                >
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold">
                      <Link href={`/lectures/${l.id}`} className="text-accent underline underline-offset-4 hover:text-primary-dark">
                        {l.title}
                      </Link>
                    </h2>
                    <p className="mt-1 text-sm">
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
        </div>
      </div>
    </main>
    </>
  );
}
