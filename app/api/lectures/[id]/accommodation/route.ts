import { NextResponse } from "next/server";
import { localize, requestLocale, serverT } from "@/lib/server-messages";
import { createClient } from "@/lib/supabase/server";
import { DraftError, generateAccommodationDraft } from "@/lib/accommodation-draft";
import type { DisabilityProfile } from "@/lib/profiles";

// Drafts the email and saves it as a draft row. Nothing is sent here. The request has no
// body: the profile comes from the signed-in student's row and the lecture's title and
// transcript from the database, so there is nothing to validate or to make large.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DRAFTS_PER_DAY = 20;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const t = await serverT();
  if (!UUID.test(params.id)) return NextResponse.json({ error: t("notFound") }, { status: 404 });
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t("signIn") }, { status: 401 });

  // Row-level security limits both reads to the caller's own rows.
  const [{ data: lecture }, { data: profileRow }] = await Promise.all([
    supabase.from("lectures").select("id, title, transcript, transcript_status").eq("id", params.id).maybeSingle(),
    supabase.from("profiles").select("disability_profile").eq("id", user.id).maybeSingle(),
  ]);
  if (!lecture) return NextResponse.json({ error: t("notFound") }, { status: 404 });
  if (!profileRow) {
    return NextResponse.json({ error: t("noProfile") }, { status: 422 });
  }
  const profile = profileRow.disability_profile as DisabilityProfile;

  // Each draft costs a model call, so cap them per student per day.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("accommodation_requests")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if (countError) {
    console.error("accommodation draft: count failed", countError.message);
    return NextResponse.json({ error: t("draftStartFailed") }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_DRAFTS_PER_DAY) {
    return NextResponse.json({ error: t("tooManyDrafts") }, { status: 429 });
  }

  let body: string;
  try {
    body = await generateAccommodationDraft(profile, {
      title: lecture.title,
      transcript: lecture.transcript_status === "ready" ? lecture.transcript : null,
    }, requestLocale());
  } catch (err) {
    const e = err instanceof DraftError ? err : new DraftError("Writing the draft failed unexpectedly. Try again.", String(err));
    console.error("accommodation draft: failed", e.detail ?? e.message);
    return NextResponse.json({ error: localize(t, e.userMessage) }, { status: 502 });
  }

  const { data: row, error } = await supabase
    .from("accommodation_requests")
    .insert({ user_id: user.id, lecture_id: lecture.id, profile_type: profile, email_body: body, status: "draft" })
    .select("id")
    .single();
  if (error || !row) {
    console.error("accommodation draft: save failed", error?.message);
    return NextResponse.json({ error: t("draftNotSaved") }, { status: 500 });
  }
  return NextResponse.json({ id: row.id, body });
}
