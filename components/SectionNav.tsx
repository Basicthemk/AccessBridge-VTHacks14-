"use client";

import { jumpTo } from "@/lib/jump-to";

/** Jump buttons for the sections of a page. Each target is the section element itself, so the whole section is marked. */
export default function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav aria-label="On this page" className="mt-4">
      <ul className="flex flex-wrap gap-2">
        {items.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} onClick={(e) => jumpTo(e, s.id)} className="btn btn-sm btn-outline">
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
