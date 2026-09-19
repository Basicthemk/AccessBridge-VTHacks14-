"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import ChatThread, { type ChatTurn } from "@/components/ChatThread";

// The same widget serves every signed-in page. What it answers about depends on the page:
// a lecture's transcript on /lectures/<id>, how to use the site anywhere else.
type Context = { kind: "lecture"; id: string } | { kind: "site"; page: "dashboard" | "upload" | "other" };

const LECTURE_PATH = /^\/lectures\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

/** Null on the sign-in and sign-up pages, where a visitor who has no account yet shouldn't see the widget. */
function contextFor(path: string): Context | null {
  if (path === "/login" || path === "/signup" || path.startsWith("/auth/")) return null;
  const lecture = LECTURE_PATH.exec(path);
  if (lecture) return { kind: "lecture", id: lecture[1] };
  if (path === "/dashboard") return { kind: "site", page: "dashboard" };
  if (path === "/upload") return { kind: "site", page: "upload" };
  return { kind: "site", page: "other" };
}

const icon = { "aria-hidden": true, width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 2.5 } as const;

type LectureState =
  | { stage: "loading" }
  | { stage: "failed"; message: string }
  | { stage: "notready"; title: string }
  | { stage: "ready"; title: string; history: ChatTurn[] };

/** Loads the lecture's title and saved questions, then shows the existing lecture chat over them. */
function LectureBody({ id, open }: { id: string; open: boolean }) {
  const [state, setState] = useState<LectureState>({ stage: "loading" });

  const load = useCallback(async () => {
    setState({ stage: "loading" });
    try {
      const res = await fetch(`/api/lectures/${id}/chat`);
      const type = res.headers.get("content-type") ?? "";
      if (res.redirected || !type.includes("application/json")) throw new Error("Your session has ended. Sign in again, then retry.");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
      setState(data.ready ? { stage: "ready", title: data.title, history: data.history } : { stage: "notready", title: data.title });
    } catch (err) {
      setState({
        stage: "failed",
        message:
          err instanceof TypeError
            ? "The request didn’t go through because the connection dropped. Check your internet, then try again."
            : (err as Error).message,
      });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <p className="font-bold">
        {state.stage === "ready" || state.stage === "notready" ? `About this lecture: ${state.title}` : "About this lecture"}
      </p>
      {state.stage === "loading" && (
        <p role="status" className="chip mt-3 border-accent text-accent">
          <svg {...icon} className="animate-spin">
            <path d="M8 2a6 6 0 1 0 6 6" />
          </svg>
          Loading your earlier questions…
        </p>
      )}
      {state.stage === "failed" && (
        <div className="mt-3">
          <p role="alert" className="callout-error inline-flex items-start gap-2">
            <svg {...icon} className="mt-1 shrink-0">
              <path d="M8 2l6.5 12h-13z M8 6.5v3.5 M8 12v.5" />
            </svg>
            <span>Problem: {state.message}</span>
          </p>
          <p className="mt-3">
            <button type="button" onClick={() => void load()} className="btn btn-outline">Try again</button>
          </p>
        </div>
      )}
      {state.stage === "notready" && (
        <p className="mt-3">This lecture’s transcript isn’t ready yet, so there is nothing to ask about. Check the Progress section of the page.</p>
      )}
      {state.stage === "ready" && (
        <div className="mt-3">
          <ChatThread
            endpoint={`/api/lectures/${id}/chat`}
            history={state.history}
            intro="Ask about anything in this lecture. Answers come only from the transcript, and if it doesn’t say, you’ll be told so."
            busyText="Finding the answer in the transcript"
            focusOnMount={open}
          />
        </div>
      )}
    </>
  );
}

/** The panel for one page. It is keyed by page, so leaving the page throws the conversation away. */
function Panel({ ctx, open, onClose, launcherRef }: { ctx: Context; open: boolean; onClose: () => void; launcherRef: React.RefObject<HTMLButtonElement> }) {
  const boxRef = useRef<HTMLDivElement>(null);

  // Opening puts focus in the panel; the box inside it takes over once it exists.
  useEffect(() => {
    if (!open) return;
    const input = boxRef.current?.querySelector("textarea");
    (input ?? boxRef.current)?.focus();
  }, [open]);

  return (
    <div
      ref={boxRef}
      id="site-chat-panel"
      role="dialog"
      aria-labelledby="site-chat-title"
      tabIndex={-1}
      className={`site-chat-panel ${open ? "flex" : "hidden"}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
          launcherRef.current?.focus();
        }
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border p-3">
        <h2 id="site-chat-title" className="text-xl font-semibold">
          {ctx.kind === "lecture" ? "Ask about this lecture" : "Help with AccessBridge"}
        </h2>
        <button
          type="button"
          onClick={() => {
            onClose();
            launcherRef.current?.focus();
          }}
          className="btn btn-sm btn-quiet"
        >
          Close
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto p-3">
        {ctx.kind === "lecture" ? (
          <LectureBody id={ctx.id} open={open} />
        ) : (
          <>
            <p className="font-bold">About using AccessBridge</p>
            <div className="mt-3">
              <ChatThread
                endpoint="/api/site-chat"
                history={[]}
                intro="Ask how to use AccessBridge: where to find things and what each feature does. I can’t help with anything else. This chat isn’t saved and clears when you leave this page."
                busyText="Finding the answer"
                extraBody={{ page: ctx.page }}
                focusOnMount={open}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function SiteChat() {
  const path = usePathname();
  const ctx = contextFor(path ?? "");
  // Same-page context, so a different lecture, or leaving a lecture, starts a fresh panel that is closed.
  const key = ctx ? (ctx.kind === "lecture" ? `lecture:${ctx.id}` : `site:${path}`) : null;
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Once opened, the panel stays in the page (hidden when collapsed) so a collapsed chat keeps its conversation.
  const [mountedKey, setMountedKey] = useState<string | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  // Changing page always starts closed, even when coming back to a page that was open before.
  useEffect(() => {
    setOpenKey(null);
    setMountedKey(null);
  }, [key]);

  if (!ctx || !key) return null;
  const open = openKey === key;
  const label = ctx.kind === "lecture" ? "Ask about this lecture" : "Help with AccessBridge";

  return (
    <div className="site-chat">
      {mountedKey === key && (
        <Panel key={key} ctx={ctx} open={open} onClose={() => setOpenKey(null)} launcherRef={launcherRef} />
      )}
      <button
        ref={launcherRef}
        type="button"
        aria-expanded={open}
        aria-controls={mountedKey === key ? "site-chat-panel" : undefined}
        onClick={() => {
          setMountedKey(key);
          setOpenKey(open ? null : key);
        }}
        className="btn btn-primary"
      >
        <svg {...icon}>
          <path d="M2 3h12v8H7l-3 3v-3H2z" />
        </svg>
        {open ? "Close chat" : label}
      </button>
    </div>
  );
}
