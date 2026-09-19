import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PROFILES, type DisabilityProfile } from "@/lib/profiles";
import AppHeader from "@/components/AppHeader";
import TranscriptStatus from "@/components/TranscriptStatus";
import GenerationStatus from "@/components/GenerationStatus";
import StudyMaterialView from "@/components/StudyMaterial";
import AccommodationRequest from "@/components/AccommodationRequest";
import FollowUpReminder from "@/components/FollowUpReminder";
import SectionNav from "@/components/SectionNav";
import { senderVerified } from "@/lib/send-email";
import { localizeState, serverT } from "@/lib/server-messages";
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
  const t = await getTranslations("Lecture");
  const tp = await getTranslations("Profiles");
  const tc = await getTranslations("Common");
  const locale = await getLocale();
  const ts = await serverT();
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
        savedOn: new Date(latest.created_at).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "UTC" }),
      };
    }
  }

  const paragraphs = transcriptReady ? parseTranscript(lecture.transcript!) : [];

  return (
    <>
      <AppHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-3 pb-7 pt-6 md:px-5">
        <p>
          <Link href="/dashboard" className="btn btn-quiet -ml-3">
            {tc("backToLectures")}
          </Link>
        </p>

        <h1 className="mt-2 max-w-4xl text-4xl font-semibold text-balance md:text-5xl">{lecture.title}</h1>
        <p className="mt-3 text-lg">
          {t.rich("uploadedLine", {
            date: new Date(lecture.created_at).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "UTC" }),
            profile: profile ? tp(`${profile.value}.label`) : t("notSet"),
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>

        <SectionNav
          items={[
            { id: "progress", label: t("progress"), show: true },
            { id: "study", label: t("study"), show: transcriptReady },
            { id: "accommodations", label: t("accommodations"), show: !!(profile && user?.email) },
            { id: "transcript", label: t("transcript"), show: transcriptReady },
          ].filter((i) => i.show)}
        />

        {/* The status controls stay in the page once the work finishes, so the change to "ready" is announced. */}
        <section id="progress" aria-labelledby="progress-heading" tabIndex={-1} className="band split concept-target">
          <h2 id="progress-heading" className="split-side text-2xl font-semibold">{t("progress")}</h2>
          <div className="split-main space-y-3">
            <TranscriptStatus lectureId={lecture.id} state={localizeState(ts, tState)} />
            {transcriptReady && profile && !loadFailed && (
              <GenerationStatus lectureId={lecture.id} state={localizeState(ts, gState)} profileLabel={tp(`${profile.value}.label`)} />
            )}
          </div>
        </section>

        {transcriptReady && (
          <section id="study" aria-labelledby="study-heading" tabIndex={-1} className="band split concept-target">
            <h2 id="study-heading" className="split-side text-2xl font-semibold md:sticky md:top-4 md:self-start">{t("study")}</h2>

            <div className="split-main">
              {!profile && (
                <p role="alert" className="callout-error max-w-prose">
                  {t("noProfile")}
                </p>
              )}

              {loadFailed && (
                <p role="alert" className="callout-error max-w-prose">
                  {t("loadFailed")}
                </p>
              )}

              {material ? (
                <StudyMaterialView material={material} lectureId={lecture.id} />
              ) : (
                profile && !loadFailed && <p className="max-w-prose">{t("materialSoon")}</p>
              )}
            </div>
          </section>
        )}

        {profile && user?.email && (
          <section id="accommodations" aria-labelledby="accommodations-heading" tabIndex={-1} className="band split concept-target">
            <h2 id="accommodations-heading" className="split-side text-2xl font-semibold md:sticky md:top-4 md:self-start">{t("accommodations")}</h2>
            <div className="split-main">
              <AccommodationRequest lectureId={lecture.id} profileLabel={tp(`${profile.value}.label`)} studentEmail={user.email} resumable={resumable} senderReady={senderVerified()} />
              <div className="band">
                <h3 className="text-xl font-semibold">{t("followUp")}</h3>
                <div className="mt-2">
                  <FollowUpReminder lectureId={lecture.id} lectureTitle={lecture.title} />
                </div>
              </div>
            </div>
          </section>
        )}

        {transcriptReady && (
          <section id="transcript" aria-labelledby="transcript-heading" tabIndex={-1} className="band split concept-target">
            <h2 id="transcript-heading" className="split-side text-2xl font-semibold md:sticky md:top-4 md:self-start">{t("transcript")}</h2>
            <div className={`split-main reading flow ${profileType === "dyslexia" ? "reading-relaxed" : ""}`}>
              {paragraphs.map((p, i) => (
                <p key={i}>
                  {p.seconds !== null && (
                    <time dateTime={`PT${p.seconds}S`} className="mb-1 block text-sm font-bold tabular-nums text-accent">
                      <span className="sr-only">{t("startsAt")}&nbsp;</span>
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
