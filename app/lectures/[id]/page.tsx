import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PROFILES, type DisabilityProfile } from "@/lib/profiles";
import AppHeader from "@/components/AppHeader";
import TranscriptStatus from "@/components/TranscriptStatus";
import GenerationStatus from "@/components/GenerationStatus";
import StudyMaterialView from "@/components/StudyMaterial";
import AccommodationRequest from "@/components/AccommodationRequest";
import FollowUpReminder from "@/components/FollowUpReminder";
import { senderVerified } from "@/lib/send-email";
import { transcriptState } from "@/lib/transcript-status";
import { formatTime, parseTranscript } from "@/lib/transcript-time";
import { generationState, type GeneratedContentRow } from "@/lib/generation-status";
import { InvalidMaterialError, parseStudyMaterial, type StudyMaterial } from "@/lib/study-material";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return { title: "Lecture · AccessBridge" };
  const { data } = await createClient().from("lectures").select("title").eq("id", params.id).maybeSingle();
  return { title: `${data?.title ?? "Lecture"} · AccessBridge` };
}

export default async function LecturePage({ params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) notFound();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Row-level security limits every read to the signed-in student's own rows.
  const { data: lecture } = await supabase
    .from("lectures")
    .select("id, title, transcript, transcript_status, transcript_error, transcript_started_at, created_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!lecture) notFound();

  const { data: profileRow } = user
    ? await supabase.from("profiles").select("disability_profile").eq("id", user.id).maybeSingle()
    : { data: null };
  const profileType = profileRow?.disability_profile as DisabilityProfile | undefined;
  const profile = PROFILES.find((p) => p.value === profileType);

  const tState = transcriptState(lecture);
  const transcriptReady = tState.kind === "ready" && !!lecture.transcript?.trim();

  let row: GeneratedContentRow | null = null;
  let loadFailed = false;
  if (transcriptReady && profileType) {
    const { data, error } = await supabase
      .from("generated_content")
      .select("status, error, started_at, content_json")
      .eq("lecture_id", lecture.id)
      .eq("profile_type", profileType)
      .maybeSingle();
    loadFailed = !!error;
    row = (data as GeneratedContentRow | null) ?? null;
  }

  // Never render material that fails the same checks it passed before it was saved.
  let material: StudyMaterial | null = null;
  let gState = generationState(row);
  if (row?.content_json && profileType) {
    try {
      material = parseStudyMaterial(profileType, row.content_json);
    } catch (err) {
      if (!(err instanceof InvalidMaterialError)) throw err;
      console.error("lecture page: invalid saved material", lecture.id, err.message);
      gState = { kind: "failed", message: "The saved study material is in a form we can’t read. Make it again." };
    }
  }

  // The newest request for this lecture, if it was never sent, can be picked up again.
  let resumable: { id: string; body: string; professorEmail: string; savedOn: string } | null = null;
  if (profile && user?.email) {
    const { data: latest } = await supabase
      .from("accommodation_requests")
      .select("id, status, email_body, professor_email, created_at")
      .eq("lecture_id", lecture.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest && (latest.status === "draft" || latest.status === "failed")) {
      resumable = {
        id: latest.id,
        body: latest.email_body,
        professorEmail: latest.professor_email ?? "",
        savedOn: new Date(latest.created_at).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" }),
      };
    }
  }

  const paragraphs = transcriptReady ? parseTranscript(lecture.transcript!) : [];

  return (
    <>
      <AppHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-3 pb-6 pt-5 md:px-5">
        <p>
          <Link href="/dashboard" className="font-bold text-accent underline underline-offset-4">
            Back to your lectures
          </Link>
        </p>

        <h1 className="mt-3 text-4xl font-semibold text-balance">{lecture.title}</h1>
        <p className="mt-2">
          Uploaded{" "}
          {new Date(lecture.created_at).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}. Study
          profile: <strong>{profile?.label ?? "Not set"}</strong>.
        </p>

        {/* The status controls stay in the page once the work finishes, so the change to "ready" is announced. */}
        <section aria-labelledby="progress" className="mt-6">
          <h2 id="progress" className="text-3xl font-semibold">Progress</h2>
          <div className="mt-3 space-y-3">
            <TranscriptStatus lectureId={lecture.id} state={tState} />
            {transcriptReady && profile && !loadFailed && (
              <GenerationStatus lectureId={lecture.id} state={gState} profileLabel={profile.label} />
            )}
          </div>
        </section>

        {transcriptReady && (
          <section aria-labelledby="study" className="mt-6">
            <h2 id="study" className="text-3xl font-semibold">Study material</h2>

            {!profile && (
              <p role="alert" className="mt-3 max-w-prose rounded-md border-2 border-error bg-surface px-3 py-2 font-bold text-error">
                Problem: We couldn’t find your study profile, so we can’t tailor the material. Sign out and back in.
              </p>
            )}

            {loadFailed && (
              <p role="alert" className="mt-3 max-w-prose rounded-md border-2 border-error bg-surface px-3 py-2 font-bold text-error">
                Problem: We couldn’t load your study material. Refresh the page to try again.
              </p>
            )}

            {material ? (
              <div className="mt-4">
                <StudyMaterialView material={material} lectureId={lecture.id} />
              </div>
            ) : (
              profile && !loadFailed && <p className="mt-3 max-w-prose">Your study material will appear here.</p>
            )}
          </section>
        )}

        {profile && user?.email && (
          <section aria-labelledby="accommodations" className="mt-6">
            <h2 id="accommodations" className="text-3xl font-semibold">Ask for accommodations</h2>
            <div className="mt-3">
              <AccommodationRequest lectureId={lecture.id} profileLabel={profile.label} studentEmail={user.email} resumable={resumable} senderReady={senderVerified()} />
            </div>
            <h3 className="mt-6 text-2xl font-semibold">Follow-up reminder</h3>
            <div className="mt-2">
              <FollowUpReminder lectureId={lecture.id} lectureTitle={lecture.title} />
            </div>
          </section>
        )}

        {transcriptReady && (
          <section aria-labelledby="transcript" className="mt-6">
            <h2 id="transcript" className="text-3xl font-semibold">Full transcript</h2>
            <div className={`reading flow mt-4 ${profileType === "dyslexia" ? "reading-relaxed" : ""}`}>
              {paragraphs.map((p, i) => (
                <p key={i}>
                  {p.seconds !== null && (
                    <time dateTime={`PT${p.seconds}S`} className="mb-1 block font-bold tabular-nums text-accent">
                      <span className="sr-only">Starts at </span>
                      {formatTime(p.seconds)}
                    </time>
                  )}
                  {p.text}
                </p>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
