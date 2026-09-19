"use client";

import { jumpTo } from "@/lib/jump-to";

/** A link to another idea in the concept map: scrolls to it, focuses it and marks it briefly (see jumpTo). */
export default function ConceptLink({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <a
      href={`#concept-${id}`}
      onClick={(e) => jumpTo(e, `concept-${id}`)}
      className="font-bold text-accent underline underline-offset-4"
    >
      {children}
    </a>
  );
}
