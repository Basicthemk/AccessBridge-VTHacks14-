import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PROFILES } from "@/lib/profiles";

// Changes the signed-in student's study profile. The request holds only {"profile": "..."}.
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 128;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) return fail("That request is too large.", 413);
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return fail("Send the request as JSON.", 415);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_REQUEST_BYTES) return fail("That request is too large.", 413);
  let input: { profile?: unknown };
  try {
    input = JSON.parse(raw);
  } catch {
    return fail("The request wasn’t valid JSON.", 400);
  }
  const chosen = PROFILES.find((p) => p.value === input?.profile);
  if (!chosen) return fail("Choose Dyslexia or Deaf or hard of hearing.", 422);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Sign in again to continue.", 401);

  // Row-level security limits the update to the student's own row.
  const { data, error } = await supabase
    .from("profiles")
    .update({ disability_profile: chosen.value })
    .eq("id", user.id)
    .select("id");
  if (error) {
    console.error("profile switch failed", error.message);
    return fail("We couldn’t change your study profile. Try again.", 500);
  }
  if (!data || data.length === 0) return fail("We couldn’t find your study profile. Sign out and back in.", 422);
  return NextResponse.json({ profile: chosen.value });
}
