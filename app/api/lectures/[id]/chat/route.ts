import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ChatError, MAX_QUESTION_CHARS, answerLectureQuestion } from "@/lib/lecture-chat";

// Answers one question about one lecture and saves the pair. The transcript never comes from the
// browser: it is read from the database under row-level security, so a student can only ask about their own lectures.
export const maxDuration = 90;
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_QUESTIONS_PER_DAY = 100;

// What the chat widget shows when it opens on a lecture page: the title and the saved questions.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });

  const { data: lecture } = await supabase
    .from("lectures")
    .select("id, title, transcript, transcript_status")
    .eq("id", params.id)
    .maybeSingle();
  if (!lecture) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });
  const ready = lecture.transcript_status === "ready" && !!lecture.transcript?.trim();
  if (!ready) return NextResponse.json({ title: lecture.title, ready: false, history: [] });

  const { data, error } = await supabase
    .from("lecture_questions")
    .select("id, question, answer")
    .eq("lecture_id", lecture.id)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    console.error("lecture chat: history failed", error.message);
    return NextResponse.json({ error: "We couldn’t load your earlier questions. Try again." }, { status: 500 });
  }
  return NextResponse.json({ title: lecture.title, ready: true, history: data ?? [] });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });

  let question = "";
  try {
    const body = await req.json();
    question = typeof body?.question === "string" ? body.question.trim() : "";
  } catch {
    // Falls through to the empty-question message.
  }
  if (!question) return NextResponse.json({ error: "Type a question first." }, { status: 400 });
  if (question.length > MAX_QUESTION_CHARS)
    return NextResponse.json({ error: `Keep the question under ${MAX_QUESTION_CHARS.toLocaleString("en-US")} characters.` }, { status: 400 });

  const { data: lecture } = await supabase
    .from("lectures")
    .select("id, title, transcript, transcript_status")
    .eq("id", params.id)
    .maybeSingle();
  if (!lecture) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });
  if (lecture.transcript_status !== "ready" || !lecture.transcript?.trim())
    return NextResponse.json({ error: "This lecture’s transcript isn’t ready yet, so there is nothing to ask about." }, { status: 409 });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("lecture_questions")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if (countError) {
    console.error("lecture chat: count failed", countError.message);
    return NextResponse.json({ error: "We couldn’t start the answer. Try again." }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_QUESTIONS_PER_DAY)
    return NextResponse.json({ error: "You’ve asked a lot of questions today. Try again tomorrow." }, { status: 429 });

  let result;
  try {
    result = await answerLectureQuestion({ title: lecture.title, transcript: lecture.transcript }, question);
  } catch (err) {
    const e = err instanceof ChatError ? err : new ChatError("Answering failed unexpectedly. Try again.", String(err));
    console.error("lecture chat: failed", e.detail ?? e.message);
    return NextResponse.json({ error: e.userMessage }, { status: 502 });
  }
  console.info("lecture chat: tokens", JSON.stringify(result.usage));

  const { data: row, error } = await supabase
    .from("lecture_questions")
    .insert({ lecture_id: lecture.id, user_id: user.id, question, answer: result.answer })
    .select("id, created_at")
    .single();
  if (error || !row) {
    console.error("lecture chat: save failed", error?.message);
    // The student still gets the answer; it just won't be there after a reload.
    return NextResponse.json({ id: crypto.randomUUID(), answer: result.answer, saved: false });
  }
  return NextResponse.json({ id: row.id, answer: result.answer, saved: true });
}
