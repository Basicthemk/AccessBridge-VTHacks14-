import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { LECTURE_BUCKET, contentTypeForPath } from "@/lib/upload";
import { STALE_AFTER_MS } from "@/lib/transcript-status";
import { TranscribeError, transcribeFromUrl } from "@/lib/transcribe";

// Vercel's Fluid Compute ceiling on the Hobby plan; the background work below
// must finish inside it. Request bodies here are tiny (the recording never
// passes through this route), so the 4.5 MB body limit doesn't apply.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const SIGNED_URL_SECONDS = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: "Lecture not found." }, { status: 404 });
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });

  // Row-level security limits this to the caller's own lectures.
  const { data: lecture } = await supabase
    .from("lectures")
    .select("id, audio_url")
    .eq("id", params.id)
    .maybeSingle();
  if (!lecture) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });

  const audioPath = lecture.audio_url;
  const mimeType = audioPath ? contentTypeForPath(audioPath) : undefined;
  if (!audioPath || !mimeType) {
    return NextResponse.json({ error: "This lecture has no recording to transcribe." }, { status: 422 });
  }

  // Claim the lecture atomically so a double click can't start two runs.
  // A run older than the function limit is dead and can be replaced.
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("lectures")
    .update({
      transcript_status: "processing",
      transcript_error: null,
      transcript_started_at: new Date().toISOString(),
    })
    .eq("id", lecture.id)
    .or(`transcript_status.neq.processing,transcript_started_at.lt.${cutoff}`)
    .select("id");
  if (claimError) {
    console.error("transcribe: claim failed", claimError.message);
    return NextResponse.json({ error: "We couldn’t start the transcript. Try again." }, { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: "This lecture is already being transcribed." }, { status: 409 });
  }

  const lectureId = lecture.id;

  async function run() {
    try {
      const { data: signed, error: signError } = await supabase.storage
        .from(LECTURE_BUCKET)
        .createSignedUrl(audioPath!, SIGNED_URL_SECONDS);
      if (signError || !signed) {
        throw new TranscribeError("We couldn’t open the recording in storage. Try again.", signError?.message);
      }
      const transcript = await transcribeFromUrl(signed.signedUrl, mimeType!);
      const { error } = await supabase
        .from("lectures")
        .update({ transcript, transcript_status: "ready", transcript_error: null })
        .eq("id", lectureId);
      if (error) throw new TranscribeError("The transcript was made but couldn’t be saved. Try again.", error.message);
    } catch (err) {
      const e =
        err instanceof TranscribeError
          ? err
          : new TranscribeError("Transcription failed unexpectedly. Try again.", String(err));
      console.error("transcribe: failed", lectureId, e.detail ?? e.message);
      await supabase
        .from("lectures")
        .update({ transcript_status: "failed", transcript_error: e.userMessage })
        .eq("id", lectureId);
    }
  }

  // Answer right away; the work continues in the background so it survives the
  // student closing the tab.
  waitUntil(run());
  return NextResponse.json({ status: "processing" }, { status: 202 });
}
