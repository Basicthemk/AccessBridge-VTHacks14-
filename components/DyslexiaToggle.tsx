"use client";

import { useState } from "react";
import { DYSLEXIA_KEY } from "@/lib/dyslexia-mode";

// The on/off text is swapped by CSS from <html data-dyslexia>, which is set before first
// paint. That keeps the server HTML and the first client render identical, so the label
// is right on the first frame and React has nothing to reconcile.
export default function DyslexiaToggle() {
  const [announcement, setAnnouncement] = useState("");

  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.dyslexia !== "true";
    if (next) root.dataset.dyslexia = "true";
    else delete root.dataset.dyslexia;
    try {
      localStorage.setItem(DYSLEXIA_KEY, next ? "on" : "off");
    } catch {
      // Storage can be blocked. The mode still applies for this page view.
    }
    setAnnouncement(next ? "Dyslexia mode is on." : "Dyslexia mode is off.");
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className="rounded-md border-2 border-accent px-3 py-2 font-bold text-accent hover:bg-accent hover:text-surface"
      >
        Dyslexia mode: <span className="dys-off">Off</span>
        <span className="dys-on">On</span>
      </button>
      <span role="status" className="sr-only">{announcement}</span>
    </>
  );
}
