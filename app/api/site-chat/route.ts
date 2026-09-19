import { NextResponse } from "next/server";
import { localize, requestLocale, serverT } from "@/lib/server-messages";
import { createClient } from "@/lib/supabase/server";
import { ChatError } from "@/lib/lecture-chat";
import { MAX_QUESTION_CHARS, SITE_PAGES, answerSiteQuestion, type SitePage } from "@/lib/site-chat";

// General "how do I use AccessBridge" help. Nothing is saved and nothing about the student or
// their lectures is sent to the model: only the question and which kind of page they're on.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const t = await serverT();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t("signIn") }, { status: 401 });

  let question = "";
  let page: SitePage = "other";
  try {
    const body = await req.json();
    question = typeof body?.question === "string" ? body.question.trim() : "";
    if (SITE_PAGES.includes(body?.page)) page = body.page;
  } catch {
    // Falls through to the empty-question message.
  }
  if (!question) return NextResponse.json({ error: t("typeQuestion") }, { status: 400 });
  if (question.length > MAX_QUESTION_CHARS)
    return NextResponse.json({ error: t("questionTooLong", { max: MAX_QUESTION_CHARS }) }, { status: 400 });

  try {
    const result = await answerSiteQuestion(question, page, requestLocale());
    console.info("site chat: tokens", JSON.stringify(result.usage));
    return NextResponse.json({ id: crypto.randomUUID(), answer: result.answer });
  } catch (err) {
    const e = err instanceof ChatError ? err : new ChatError("Answering failed unexpectedly. Try again.", String(err));
    console.error("site chat: failed", e.detail ?? e.message);
    return NextResponse.json({ error: localize(t, e.userMessage) }, { status: 502 });
  }
}
