"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 5000;

// One timer for the whole page, however many rows are waiting. Each waiting row registers
// while it needs updates; the timer runs while at least one is registered, and one
// router.refresh() re-reads the page for all of them. Hidden tabs skip the refresh.
let waiting = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let refresh: (() => void) | null = null;

export function useSharedPoll(active: boolean) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    refresh = () => router.refresh();
    waiting += 1;
    if (!timer) {
      timer = setInterval(() => {
        if (!document.hidden) refresh?.();
      }, POLL_MS);
    }
    return () => {
      waiting -= 1;
      if (waiting === 0) {
        clearInterval(timer);
        timer = undefined;
        refresh = null;
      }
    };
  }, [active, router]);
}
