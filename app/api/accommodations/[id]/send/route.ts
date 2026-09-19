import { NextResponse } from "next/server";
import { checkText, localize, serverT } from "@/lib/server-messages";
import { createClient } from "@/lib/supabase/server";
import { MAX_REQUEST_BYTES, buildEmail, checkBody, checkProfessorEmail } from "@/lib/accommodation";
import { SendError, sendEmail } from "@/lib/send-email";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SENDS_PER_DAY = 10;
/** A "sending" row older than this is a run that died, so it may be claimed again. */
const SENDING_STALE_MS = 2 * 60 * 1000;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const t = await serverT();
  if (!UUID.test(params.id)) return fail(t("draftNotFound"), 404);

  // Keep the body small before reading it. The header can lie, so the text is measured too.
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_REQUEST_BYTES) return fail(t("tooLarge"), 413);
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return fail(t("sendJson"), 415);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_REQUEST_BYTES) return fail(t("tooLarge"), 413);
  let input: { professorEmail?: unknown; body?: unknown };
  try {
    input = JSON.parse(raw);
  } catch {
    return fail(t("badJson"), 400);
  }
  if (!input || typeof input !== "object") return fail(t("badJson"), 400);

  const to = checkProfessorEmail(input.professorEmail);
  if (!to.ok) return fail(checkText(t, to), 422);
  const body = checkBody(input.body);
  if (!body.ok) return fail(checkText(t, body), 422);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(t("signIn"), 401);
  if (!user.email) return fail(t("noAccountEmail"), 422);

  // Cap sends per student so the sender address can't be used as a relay.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("accommodation_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", since);
  if (countError) {
    console.error("accommodation send: count failed", countError.message);
    return fail(t("sendLimitCheck"), 500);
  }
  if ((count ?? 0) >= MAX_SENDS_PER_DAY) return fail(t("sendLimitDay"), 429);

  // Claim the draft atomically so a double click can't send twice. Row-level security
  // limits the update to the student's own rows.
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - SENDING_STALE_MS).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("accommodation_requests")
    .update({
      status: "sending",
      professor_email: to.value,
      email_body: body.value,
      error: null,
      updated_at: now,
    })
    .eq("id", params.id)
    .or(`status.in.(draft,failed),and(status.eq.sending,updated_at.lt.${staleBefore})`)
    .select("id");
  if (claimError) {
    console.error("accommodation send: claim failed", claimError.message);
    return fail(t("sendStartFailed"), 500);
  }
  if (!claimed || claimed.length === 0) {
    const { data: existing } = await supabase.from("accommodation_requests").select("status").eq("id", params.id).maybeSingle();
    if (!existing) return fail(t("draftNotFound"), 404);
    return fail(existing.status === "sent" ? "This email was already sent." : "This email is already being sent.", 409);
  }

  const email = buildEmail(body.value, user.email);
  try {
    const resendId = await sendEmail({
      to: to.value,
      replyTo: user.email,
      ...email,
      // Same claim, same key: a retry of this exact claim can't deliver twice.
      idempotencyKey: `accommodation-${params.id}-${now}`,
    });
    const sentAt = new Date().toISOString();
    const { error } = await supabase
      .from("accommodation_requests")
      .update({ status: "sent", sent_at: sentAt, resend_id: resendId, error: null, updated_at: sentAt })
      .eq("id", params.id);
    if (error) console.error("accommodation send: sent but not recorded", params.id, error.message);
    return NextResponse.json({ status: "sent", sentAt, to: to.value });
  } catch (err) {
    const e = err instanceof SendError ? err : new SendError("Sending failed unexpectedly. Try again.", String(err));
    console.error("accommodation send: failed", params.id, e.detail ?? e.message);
    await supabase
      .from("accommodation_requests")
      .update({ status: "failed", error: e.userMessage, updated_at: new Date().toISOString() })
      .eq("id", params.id);
    return fail(localize(t, e.userMessage), 502);
  }
}
