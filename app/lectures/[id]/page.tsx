import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PROFILES, type DisabilityProfile } from "@/lib/profiles";
import AppHeader from "@/components/AppHeader";
import TranscriptStatus from "@/components/TranscriptStatus";
import GenerationStatus from "@/components/GenerationStatus";
import StudyMaterialView from "@/components/StudyMaterial";
import { transcriptState } from "@/lib/transcript-status";
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

  const paragraphs: string[] = transcriptReady
    ? lecture.transcript!.split(/\n\s*\n/).map((p: string) => p.trim()).filter(Boolean)
    : [];

  return (
    <main className="mx-auto max-w-6xl px-3 py-5 md:px-5">
      <AppHeader />

      <p className="mt-4">
        <Link href="/dashboard" className="font-bold text-accent underline underline-offset-4">
          Back to your lectures
        </Link>
      </p>

      <h1 className="mt-3 text-4xl font-semibold">{lecture.title}</h1>
      <p className="mt-2">
        Uploaded{" "}
        {new Date(lecture.created_at).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}. Study
        profile: <strong>{profile?.label ?? "Not set"}</strong>.
      </p>

      {!transcriptReady && (
        <section aria-labelledby="transcript-status" className="mt-5">
          <h2 id="transcript-status" className="text-2xl font-semibold">Transcript</h2>
          <div className="mt-3">
            <TranscriptStatus lectureId={lecture.id} state={tState} />
          </div>
        </section>
      )}

      {transcriptReady && (
        <>
          <section aria-labelledby="study" className="mt-6">
            <h2 id="study" className="text-3xl font-semibold">Study material</h2>

            {!profile && (
              <p role="alert" className="mt-3 max-w-prose rounded-md border-2 border-error px-2 py-1 font-bold text-error">
                Problem: We couldn’t find your study profile, so we can’t tailor the material. Sign out and back in.
              </p>
            )}

            {loadFailed && (
              <p role="alert" className="mt-3 max-w-prose rounded-md border-2 border-error px-2 py-1 font-bold text-error">
                Problem: We couldn’t load your study material. Refresh the page to try again.
              </p>
            )}

            {profile && !loadFailed && !(material && gState.kind === "ready") && (
              <div className="mt-3">
                <GenerationStatus lectureId={lecture.id} state={gState} profileLabel={profile.label} />
              </div>
            )}

            {material && (
              <div className="mt-4">
                <StudyMaterialView material={material} />
              </div>
            )}
          </section>

          <section aria-labelledby="transcript" className="mt-7">
            <h2 id="transcript" className="text-3xl font-semibold">Full transcript</h2>
            <div className={`reading flow mt-4 ${profileType === "dyslexia" ? "reading-relaxed" : ""}`}>
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
