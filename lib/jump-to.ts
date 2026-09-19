import type { MouseEvent } from "react";

const FLASH_MS = 2000;
const timers = new WeakMap<HTMLElement, number>();

/**
 * Click handler for an in-page link. Without script the link is an ordinary anchor. With script it
 * scrolls the target to the middle of the screen, moves keyboard focus to it (so a screen reader reads
 * it), and marks it for two seconds so the reader can see where they landed. The mark is an outline
 * as well as a tint, so it doesn't depend on colour. Reduced-motion readers get a jump, not a glide.
 * The target needs tabIndex={-1} and the "concept-target" class.
 */
export function jumpTo(e: MouseEvent<HTMLAnchorElement>, targetId: string) {
  // Let the browser handle new-tab and modified clicks.
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const target = document.getElementById(targetId);
  if (!target) return;
  e.preventDefault();

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // A target taller than the screen would lose its top if centred, so start at its top instead.
  const tall = target.getBoundingClientRect().height > window.innerHeight * 0.9;
  target.scrollIntoView({ block: tall ? "start" : "center", behavior: reduce ? "auto" : "smooth" });
  target.focus({ preventScroll: true });
  history.pushState(null, "", `#${targetId}`);

  const prior = timers.get(target);
  if (prior) window.clearTimeout(prior);
  target.setAttribute("data-flash", "true");
  timers.set(
    target,
    window.setTimeout(() => {
      target.removeAttribute("data-flash");
      timers.delete(target);
    }, FLASH_MS)
  );
}
