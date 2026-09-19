import { NextResponse } from "next/server";
import { serverT } from "@/lib/server-messages";
import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { STALE_AFTER_MS, transcriptState } from "@/lib/transcript-status";
import { GenerateError, generateStudyMaterial } from "@/lib/generate-study-material";
import { removeAudioFiles } from "@/lib/read-aloud-cleanup";
import { stripTimestamps } from "@/lib/transcript-time";
import type { DisabilityProfile } from "@/lib/profiles";

// Same ceiling as the transcription route. The model calls stop starting new
// attempts after RUN_BUDGET_MS so a failure is recorded before the limit hits.
// The request has no body: the profile comes from the signed-in user's row and
// the transcript from the database, so nothing large crosses the wire.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const t = await serverT();
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: t("notFound") }, { status: 404 });
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t("signIn") }, { status: 401 });

  // Row-level security limits both reads to the caller's own rows.
  const [{ data: lecture }, { data: profileRow }] = await Promise.all([
    supabase
      .from("lectures")
      .select("id, transcript, transcript_status, transcript_error, transcript_started_at")
      .eq("id", params.id)
      .maybeSingle(),
    supabase.from("profiles").select("disability_profile").eq("id", user.id).maybeSingle(),
  ]);
  if (!lecture) return NextResponse.json({ error: t("notFound") }, { status: 404 });
  if (!profileRow) return NextResponse.json({ error: t("noProfile") }, { status: 422 });
  if (transcriptState(lecture).kind !== "ready" || !lecture.transcript?.trim()) {
    return NextResponse.json({ error: t("finishTranscript") }, { status: 422 });
  }

  const profile = profileRow.disability_profile as DisabilityProfile;
  // The study material is made from the words alone; the times stay in the transcript.
  const transcript = stripTimestamps(lecture.transcript);
  const lectureId = lecture.id;
  const now = new Date().toISOString();

  // Claim the (lecture, profile) row atomically so a double click can't start two runs.
  // The unique index makes the insert fail when a row exists; then take it over only if
  // it isn't running, or if its run is older than the function limit and so is dead.
  const { error: insertError } = await supabase
    .from("generated_content")
    .insert({ lecture_id: lectureId, profile_type: profile, status: "processing", started_at: now });
  if (insertError) {
    if (insertError.code !== "23505") {
      console.error("generate: claim failed", insertError.message);
      return NextResponse.json({ error: t("generateStartFailed") }, { status: 500 });
    }
    const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
    const { data: claimed, error: claimError } = await supabase
      .from("generated_content")
      .update({ status: "processing", error: null, started_at: now, updated_at: now })
      .eq("lecture_id", lectureId)
      .eq("profile_type", profile)
      .or(`status.neq.processing,started_at.lt.${cutoff}`)
      .select("id");
    if (claimError) {
      console.error("generate: claim failed", claimError.message);
      return NextResponse.json({ error: t("generateStartFailed") }, { status: 500 });
    }
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: t("generateAlready") }, { status: 409 });
    }
  }

  async function run() {
    const where = { lecture_id: lectureId, profile_type: profile };
    try {
      const material = await generateStudyMaterial(profile, transcript!);
      const { error } = await supabase
        .from("generated_content")
        .update({ content_json: material, status: "ready", error: null, updated_at: new Date().toISOString() })
        .match(where);
      if (error) throw new GenerateError("The study material was made but couldn’t be saved. Try again.", error.message);
      // The words changed, so audio made from the old material can never be asked for again.
      if (profile === "dyslexia") await removeAudioFiles(supabase, { lectureId });
    } catch (err) {
      const e =
        err instanceof GenerateError
          ? err
          : new GenerateError("Making the study material failed unexpectedly. Try again.", String(err));
      console.error("generate: failed", lectureId, profile, e.detail ?? e.message);
      // Any earlier content_json is kept, so a failed retry doesn't wipe good material.
      await supabase
        .from("generated_content")
        .update({ status: "failed", error: e.userMessage, updated_at: new Date().toISOString() })
        .match(where);
    }
  }

  // Answer right away; the work continues in the background so it survives the
  // student closing the tab.
  waitUntil(run());
  return NextResponse.json({ status: "processing" }, { status: 202 });
}
