import { NextResponse } from "next/server";
import { serverT } from "@/lib/server-messages";
import { createClient } from "@/lib/supabase/server";
import { LECTURE_BUCKET, MAX_TITLE } from "@/lib/upload";

// Renames or deletes one of the signed-in student's lectures. Everything runs as the student:
// row-level security and the storage policies limit each read, update and delete to their own
// rows and files, so no service-role key is needed.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REQUEST_BYTES = 2048;
const READ_ALOUD_BUCKET = "readaloud";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const t = await serverT();
  if (!UUID.test(params.id)) return fail(t("notFound"), 404);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) return fail(t("tooLarge"), 413);
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return fail(t("sendJson"), 415);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_REQUEST_BYTES) return fail(t("tooLarge"), 413);
  let input: { title?: unknown };
  try {
    input = JSON.parse(raw);
  } catch {
    return fail(t("badJson"), 400);
  }
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  if (!title) return fail(t("titleRequired"), 422);
  if (title.length > MAX_TITLE) return fail(t("titleTooLong", { max: MAX_TITLE }), 422);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(t("signIn"), 401);

  const { data, error } = await supabase.from("lectures").update({ title }).eq("id", params.id).select("id, title");
  if (error) {
    console.error("lecture rename failed", error.message);
    return fail(t("renameFailed"), 500);
  }
  if (!data || data.length === 0) return fail(t("notFound"), 404);
  return NextResponse.json({ title: data[0].title });
}

// Removes the lecture and everything that belongs to it. Files go first, while the rows that name
// them still exist; the lecture row goes last. If a step fails the lecture is left in place and the
// student can try again, so nothing is left behind without a lecture to find it by.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const t = await serverT();
  if (!UUID.test(params.id)) return fail(t("notFound"), 404);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(t("signIn"), 401);

  const { data: lecture, error: lectureError } = await supabase
    .from("lectures")
    .select("id, audio_url")
    .eq("id", params.id)
    .maybeSingle();
  if (lectureError) {
    console.error("lecture delete: lookup failed", lectureError.message);
    return fail(t("deleteFailed"), 500);
  }
  if (!lecture) return fail(t("notFound"), 404);

  try {
    // Read-aloud MP3s: the ones the table knows about, plus anything else in this lecture's folder
    // (an upload whose row was never written).
    const paths = new Set<string>();
    const { data: rows, error: rowsError } = await supabase.from("read_aloud_audio").select("path").eq("lecture_id", lecture.id);
    if (rowsError) throw new Error(`audio rows: ${rowsError.message}`);
    for (const r of rows ?? []) paths.add(r.path as string);
    const folder = `${user.id}/${lecture.id}`;
    const { data: listed, error: listError } = await supabase.storage.from(READ_ALOUD_BUCKET).list(folder, { limit: 1000 });
    if (listError) throw new Error(`audio list: ${listError.message}`);
    for (const f of listed ?? []) paths.add(`${folder}/${f.name}`);
    if (paths.size > 0) {
      const { error } = await supabase.storage.from(READ_ALOUD_BUCKET).remove(Array.from(paths));
      if (error) throw new Error(`audio remove: ${error.message}`);
    }

    // The recording. A failed removal must stop the delete, so check the file is really gone.
    const recording = lecture.audio_url as string | null;
    if (recording) {
      const { error } = await supabase.storage.from(LECTURE_BUCKET).remove([recording]);
      if (error) throw new Error(`recording remove: ${error.message}`);
      const { data: stillThere } = await supabase.storage.from(LECTURE_BUCKET).exists(recording);
      if (stillThere) throw new Error("recording remove: file still present");
    }

    // The database points accommodation requests at a lecture with "on delete set null", so they
    // would outlive it; delete them here. Study material, questions and answers, and the
    // read-aloud rows are removed by the lecture row's own cascade.
    const { error: requestsError } = await supabase.from("accommodation_requests").delete().eq("lecture_id", lecture.id);
    if (requestsError) throw new Error(`accommodation requests: ${requestsError.message}`);

    const { data: removed, error: removeError } = await supabase.from("lectures").delete().eq("id", lecture.id).select("id");
    if (removeError) throw new Error(`lecture row: ${removeError.message}`);
    if (!removed || removed.length === 0) throw new Error("lecture row: nothing deleted");
  } catch (err) {
    console.error("lecture delete failed", err instanceof Error ? err.message : String(err));
    return fail(t("deleteFailed"), 500);
  }
  return NextResponse.json({ deleted: true });
}
