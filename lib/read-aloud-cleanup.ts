import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "readaloud";

/**
 * Deletes read-aloud MP3 files for one lecture, optionally only one section and never `keepPath`.
 * Runs as the signed-in student: the bucket's delete policy and the table's row-level security
 * both limit it to their own files, so no service-role key is needed. It removes files only.
 * The read_aloud_audio rows stay because they are the record the daily and monthly limits count.
 * Never throws: a failed cleanup only leaves an unused file behind.
 */
export async function removeAudioFiles(
  supabase: SupabaseClient,
  opts: { lectureId: string; section?: string; keepPath?: string }
): Promise<void> {
  try {
    let q = supabase.from("read_aloud_audio").select("path").eq("lecture_id", opts.lectureId);
    if (opts.section) q = q.eq("section", opts.section);
    if (opts.keepPath) q = q.neq("path", opts.keepPath);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const paths = (data ?? []).map((r) => r.path as string);
    if (paths.length === 0) return;
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
    if (removeError) throw new Error(removeError.message);
  } catch (err) {
    console.error("read aloud: cleanup failed", err instanceof Error ? err.message : String(err));
  }
}
