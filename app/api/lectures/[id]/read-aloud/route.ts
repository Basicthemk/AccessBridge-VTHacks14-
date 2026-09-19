import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SpeechError, TTS_FORMAT, TTS_MODEL, TTS_VOICE, synthesize } from "@/lib/elevenlabs";
import { MAX_CHARS_ALL_STUDENTS_PER_MONTH, MAX_CHARS_PER_DAY, MAX_CHARS_PER_MONTH, MAX_REQUEST_BYTES, MAX_SECTION_CHARS, isSection, sectionText } from "@/lib/read-aloud";
import { removeAudioFiles } from "@/lib/read-aloud-cleanup";
import { InvalidMaterialError, parseStudyMaterial } from "@/lib/study-material";

// Returns a short-lived link to the audio for one section of a student's study material.
// The request holds only the section name. The words come from the saved material, so the
// browser can't send its own text to be spoken (and paid for).
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = "readaloud";
const LINK_SECONDS = 60 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return fail("Lecture not found.", 404);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_REQUEST_BYTES) return fail("That request is too large.", 413);
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return fail("Send the request as JSON.", 415);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_REQUEST_BYTES) return fail("That request is too large.", 413);
  let input: { section?: unknown };
  try {
    input = JSON.parse(raw);
  } catch {
    return fail("The request wasn’t valid JSON.", 400);
  }
  if (!input || typeof input !== "object" || !isSection(input.section)) {
    return fail("Choose summary, terms or outline.", 422);
  }
  const section = input.section;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Sign in again to continue.", 401);

  // Row-level security limits every read to the signed-in student's own rows.
  const [{ data: profileRow }, { data: lecture }] = await Promise.all([
    supabase.from("profiles").select("disability_profile").eq("id", user.id).maybeSingle(),
    supabase.from("lectures").select("id").eq("id", params.id).maybeSingle(),
  ]);
  if (!lecture) return fail("Lecture not found.", 404);
  if (profileRow?.disability_profile !== "dyslexia") return fail("Read aloud is for the dyslexia study profile.", 403);

  const { data: content, error: contentError } = await supabase
    .from("generated_content")
    .select("status, content_json")
    .eq("lecture_id", lecture.id)
    .eq("profile_type", "dyslexia")
    .maybeSingle();
  if (contentError) {
    console.error("read aloud: material load failed", contentError.message);
    return fail("We couldn’t load your study material. Try again.", 500);
  }
  if (!content || content.status !== "ready" || !content.content_json) {
    return fail("Make your study material first, then read it aloud.", 409);
  }

  let text: string;
  try {
    const material = parseStudyMaterial("dyslexia", content.content_json);
    if (material.profile !== "dyslexia") throw new InvalidMaterialError("wrong profile");
    text = sectionText(material, section);
  } catch (err) {
    if (!(err instanceof InvalidMaterialError)) throw err;
    return fail("The saved study material is in a form we can’t read aloud. Make it again.", 422);
  }
  if (!text.trim()) return fail("This section has nothing to read.", 422);
  if (text.length > MAX_SECTION_CHARS) return fail(`This section is too long to read aloud (over ${MAX_SECTION_CHARS.toLocaleString("en-US")} characters). Read it on screen instead.`, 422);

  const hash = createHash("sha256").update(`${TTS_MODEL}|${TTS_VOICE}|${TTS_FORMAT}|${text}`).digest("hex").slice(0, 40);
  const path = `${user.id}/${lecture.id}/${hash}.mp3`;

  const sign = async () => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, LINK_SECONDS);
    return error || !data ? null : data.signedUrl;
  };

  // Same text, voice and model as before: reuse the file and spend nothing.
  const { data: cached } = await supabase.from("read_aloud_audio").select("id").eq("path", path).maybeSingle();
  // Cleanup removes files but keeps rows, so a row alone doesn't prove the file is still there.
  const { data: fileThere } = cached ? await supabase.storage.from(BUCKET).exists(path) : { data: false };
  if (cached && fileThere) {
    const url = await sign();
    if (url) return NextResponse.json({ url, cached: true, characters: text.length });
    // The file is gone (cleaned up, or deleted by hand): fall through and rebuild it.
  }

  // The rows are the spending ledger: files may be deleted, rows stay, so regenerating
  // material and asking again can't reset the limits. Rows are only removed with the account.
  const monthAgo = new Date(Date.now() - MONTH_MS).toISOString();
  const { data: recent, error: recentError } = await supabase
    .from("read_aloud_audio")
    .select("characters, created_at")
    .gte("created_at", monthAgo);
  if (recentError) {
    console.error("read aloud: budget check failed", recentError.message);
    return fail("We couldn’t check your audio limit. Try again.", 500);
  }
  const dayAgo = Date.now() - DAY_MS;
  let usedMonth = 0;
  let usedDay = 0;
  for (const r of recent ?? []) {
    usedMonth += r.characters as number;
    if (Date.parse(r.created_at as string) >= dayAgo) usedDay += r.characters as number;
  }
  if (usedDay + text.length > MAX_CHARS_PER_DAY) {
    return fail("You’ve reached today’s read-aloud limit. Audio you’ve already made still plays. Try again tomorrow.", 429);
  }
  if (usedMonth + text.length > MAX_CHARS_PER_MONTH) {
    return fail("You’ve reached this month’s read-aloud limit. Audio you’ve already made still plays.", 429);
  }

  // Shared cap across all students. The function comes from supabase/readaloud-global-cap.sql;
  // until that has been run, only the per-student limits apply and this is logged loudly.
  const { data: allUsed, error: allError } = await supabase.rpc("read_aloud_characters_last_30_days");
  if (allError) {
    if (allError.code === "PGRST202" || allError.code === "42883") {
      console.error("read aloud: shared cap NOT enforced, run supabase/readaloud-global-cap.sql", allError.message);
    } else {
      console.error("read aloud: shared cap check failed", allError.message);
      return fail("We couldn’t check the audio limit. Try again.", 500);
    }
  } else if (Number(allUsed) + text.length > MAX_CHARS_ALL_STUDENTS_PER_MONTH) {
    return fail("Read aloud has reached its limit for this month across all students. Audio you’ve already made still plays. It opens up again as older audio ages out.", 429);
  }

  let audio: Buffer;
  try {
    ({ audio } = await synthesize(text));
  } catch (err) {
    const e = err instanceof SpeechError ? err : new SpeechError("Making the audio failed unexpectedly. Try again.", String(err));
    console.error("read aloud: synthesis failed", e.detail ?? e.message);
    return fail(e.userMessage, 502);
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, audio, { contentType: "audio/mpeg", upsert: true });
  if (uploadError) {
    console.error("read aloud: upload failed", uploadError.message);
    return fail("The audio was made but couldn’t be saved. Try again.", 500);
  }
  const { error: rowError } = await supabase
    .from("read_aloud_audio")
    .upsert(
      { user_id: user.id, lecture_id: lecture.id, section, text_hash: hash, path, characters: text.length, created_at: new Date().toISOString() },
      { onConflict: "user_id,path" }
    );
  if (rowError) console.error("read aloud: cache row not saved", rowError.message);

  // Material was regenerated since the older files for this section were made: drop them.
  if (!rowError) await removeAudioFiles(supabase, { lectureId: lecture.id, section, keepPath: path });

  const url = await sign();
  if (!url) return fail("The audio was made but we couldn’t open it. Try again.", 500);
  return NextResponse.json({ url, cached: false, characters: text.length });
}
