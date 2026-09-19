"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SessionEndedError, useExplainError } from "@/lib/client-errors";
import { MAX_TITLE } from "@/lib/upload";

type Mode = "view" | "rename" | "confirm";

const menuItem = "block w-full whitespace-nowrap rounded-sm px-3 py-2 text-left font-bold hover:bg-background";

// Says something to a screen reader from outside the row, so it survives the row being removed.
function announce(message: string) {
  const el = document.createElement("p");
  el.setAttribute("role", "status");
  el.className = "sr-only";
  document.body.appendChild(el);
  // A live region that already exists is announced when its text changes; one inserted with its text is often missed.
  setTimeout(() => {
    el.textContent = message;
  }, 100);
  setTimeout(() => el.remove(), 6000);
}

// One lecture in the dashboard list: its title and date, the "..." menu with Rename and Delete,
// and (as children) the transcript status. Rename and the delete confirmation open in place of the title.
export default function LectureRow({
  id,
  title,
  uploaded,
  children,
}: {
  id: string;
  title: string;
  uploaded: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const t = useTranslations("LectureMenu");
  const tc = useTranslations("Common");
  const te = useTranslations("Errors");
  const ts = useTranslations("Server");
  const explain = useExplainError();
  const uid = useId();
  const menuId = `${uid}-menu`;
  const inputId = `${uid}-title`;
  const errorId = `${uid}-error`;
  const confirmTitleId = `${uid}-confirm-title`;
  const confirmBodyId = `${uid}-confirm-body`;

  const [shown, setShown] = useState(title);
  const [mode, setMode] = useState<Mode>("view");
  const [menuOpen, setMenuOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  const rowRef = useRef<HTMLLIElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const firstFocus = useRef<"first" | "last">("first");
  const returnFocus = useRef(false);

  // Follow the server's title when the list is refreshed (for example after a rename made elsewhere).
  useEffect(() => setShown(title), [title]);

  // Open the menu on the side that keeps it on screen.
  useLayoutEffect(() => {
    if (!menuOpen || !menuRef.current || !menuBtn.current) return;
    const button = menuBtn.current.getBoundingClientRect();
    setAlignRight(button.left + menuRef.current.offsetWidth > document.documentElement.clientWidth - 16);
  }, [menuOpen]);

  // Move focus into the menu when it opens.
  useEffect(() => {
    if (!menuOpen) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (items?.length) items[firstFocus.current === "last" ? items.length - 1 : 0].focus();
  }, [menuOpen]);

  // Click or tap outside closes the menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [menuOpen]);

  // Focus follows the mode: into the field or onto the safe button, and back to the menu button after.
  useEffect(() => {
    if (mode === "rename") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (mode === "confirm") {
      cancelRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      menuBtn.current?.focus();
    }
  }, [mode]);

  function openMenu(which: "first" | "last") {
    firstFocus.current = which;
    setMenuOpen(true);
  }

  function closeMenu(refocus: boolean) {
    setMenuOpen(false);
    if (refocus) menuBtn.current?.focus();
  }

  function onButtonKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openMenu("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openMenu("last");
    }
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === "Tab") setMenuOpen(false);
  }

  function startRename() {
    setMenuOpen(false);
    setDraft(shown);
    setProblem(null);
    setMode("rename");
  }

  function startDelete() {
    setMenuOpen(false);
    setProblem(null);
    setMode("confirm");
  }

  function cancel() {
    if (busy) return;
    setProblem(null);
    returnFocus.current = true;
    setMode("view");
  }

  function onEscape(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  async function call(method: "PATCH" | "DELETE", body?: unknown) {
    const res = await fetch(`/api/lectures/${id}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const type = res.headers.get("content-type") ?? "";
    if (res.redirected || !type.includes("application/json")) throw new SessionEndedError();
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? te("generic"));
    return data;
  }

  async function saveRename(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next = draft.trim();
    if (!next) {
      setProblem(ts("titleRequired"));
      inputRef.current?.focus();
      return;
    }
    if (next === shown) return cancel();
    setBusy(true);
    setProblem(null);
    try {
      const data = await call("PATCH", { title: next });
      setShown(data.title);
      announce(t("renamed", { title: data.title }));
      returnFocus.current = true;
      setMode("view");
      router.refresh();
    } catch (err) {
      setProblem(explain(err));
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await call("DELETE");
      // Send focus to a neighbouring lecture before this row goes, so it isn't dropped onto the page.
      const sibling = rowRef.current?.nextElementSibling ?? rowRef.current?.previousElementSibling;
      const target = sibling?.querySelector<HTMLElement>("a") ?? document.getElementById("main");
      announce(t("deleted", { title: shown }));
      setGone(true);
      setTimeout(() => target?.focus(), 0);
      router.refresh();
    } catch (err) {
      setProblem(explain(err));
      setBusy(false);
    }
  }

  if (gone) return null;

  return (
    <li ref={rowRef} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-t border-border py-4">
      <div className="min-w-0">
        {mode === "view" && (
          <div className="flex items-start gap-2">
            <h2 className="min-w-0 text-xl font-semibold">
              <Link href={`/lectures/${id}`} className="text-accent underline underline-offset-4 hover:text-primary-dark">
                {shown}
              </Link>
            </h2>
            <div ref={wrapRef} className="relative flex-none">
              <button
                ref={menuBtn}
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuId : undefined}
                aria-label={t("actions", { title: shown })}
                onClick={() => (menuOpen ? closeMenu(false) : openMenu("first"))}
                onKeyDown={onButtonKey}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border-2 border-transparent text-accent hover:border-accent"
              >
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <circle cx="10" cy="4" r="2" />
                  <circle cx="10" cy="10" r="2" />
                  <circle cx="10" cy="16" r="2" />
                </svg>
              </button>
              {menuOpen && (
                <div
                  ref={menuRef}
                  id={menuId}
                  role="menu"
                  aria-label={t("actions", { title: shown })}
                  onKeyDown={onMenuKey}
                  className={`absolute z-10 mt-1 min-w-max rounded-md border-2 border-accent bg-surface p-1 ${alignRight ? "right-0" : "left-0"}`}
                >
                  <button type="button" role="menuitem" onClick={startRename} className={`${menuItem} text-accent`}>
                    {t("rename")}
                  </button>
                  <button type="button" role="menuitem" onClick={startDelete} className={`${menuItem} text-error`}>
                    {t("delete")}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {mode === "rename" && (
          <form onSubmit={saveRename} onKeyDown={onEscape} className="max-w-prose">
            <label htmlFor={inputId} className="block font-bold">
              {t("renameLabel")}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              value={draft}
              maxLength={MAX_TITLE}
              onChange={(e) => setDraft(e.target.value)}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? errorId : undefined}
              className="field"
            />
            {problem && (
              <p id={errorId} role="alert" className="callout-error mt-2">
                {tc("problem", { message: problem })}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="submit" aria-disabled={busy} className="btn btn-sm btn-primary">
                {busy ? t("saving") : t("save")}
              </button>
              <button type="button" onClick={cancel} className="btn btn-sm btn-outline">
                {t("cancel")}
              </button>
            </div>
          </form>
        )}

        {mode === "confirm" && (
          <div
            role="group"
            aria-labelledby={confirmTitleId}
            aria-describedby={confirmBodyId}
            onKeyDown={onEscape}
            className="max-w-prose rounded-md border-2 border-error bg-surface p-3"
          >
            <p id={confirmTitleId} className="font-bold">
              {t("confirmTitle", { title: shown })}
            </p>
            <p id={confirmBodyId} className="mt-1">
              {t("confirmBody")}
            </p>
            {problem && (
              <p role="alert" className="callout-error mt-2">
                {tc("problem", { message: problem })}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button ref={cancelRef} type="button" onClick={cancel} className="btn btn-sm btn-outline">
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                aria-disabled={busy}
                className="btn btn-sm border-error bg-error text-surface hover:border-ink hover:bg-ink"
              >
                {busy ? t("deleting") : t("confirmDelete")}
              </button>
            </div>
          </div>
        )}

        <p className="mt-1 text-sm">{uploaded}</p>
      </div>
      {children}
    </li>
  );
}
