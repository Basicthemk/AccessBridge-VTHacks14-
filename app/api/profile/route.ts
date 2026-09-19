import { NextResponse } from "next/server";
import { serverT } from "@/lib/server-messages";
import { createClient } from "@/lib/supabase/server";
import { PROFILES } from "@/lib/profiles";

// Changes the signed-in student's study profile. The request holds only {"profile": "..."}.
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 128;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const t = await serverT();
  if (Number(req.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) return fail(t("tooLarge"), 413);
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return fail(t("sendJson"), 415);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_REQUEST_BYTES) return fail(t("tooLarge"), 413);
  let input: { profile?: unknown };
  try {
    input = JSON.parse(raw);
  } catch {
    return fail(t("badJson"), 400);
  }
  const chosen = PROFILES.find((p) => p.value === input?.profile);
  if (!chosen) return fail(t("chooseProfile"), 422);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(t("signIn"), 401);

  // Row-level security limits the update to the student's own row.
  const { data, error } = await supabase
    .from("profiles")
    .update({ disability_profile: chosen.value })
    .eq("id", user.id)
    .select("id");
  if (error) {
    console.error("profile switch failed", error.message);
    return fail(t("profileChangeFailed"), 500);
  }
  if (!data || data.length === 0) return fail(t("noProfile"), 422);
  return NextResponse.json({ profile: chosen.value });
}
