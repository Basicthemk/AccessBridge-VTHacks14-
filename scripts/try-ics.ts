// Prints a sample follow-up .ics and checks its shape:  npx tsx scripts/try-ics.ts
import { buildFollowUpIcs, describeFollowUp, followUpStart, icsFileName } from "../lib/calendar";

const cases = [
  "Bio 101, Week 3; Cells\\Membranes",
  "x".repeat(200),
  "Física — 光合作用 🎓 lecture",
  "",
  "Line\nbreak\r\nhere",
];
let fail = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fail++;
    console.error("FAIL:", m);
  }
};
const enc = new TextEncoder();

for (const t of cases) {
  const ics = buildFollowUpIcs({
    lectureId: "11111111-2222-3333-4444-555555555555",
    lectureTitle: t,
    lectureUrl: "https://x.example/lectures/1?a=b,c",
    now: new Date(2026, 8, 19, 15, 30),
  });
  const lines = ics.split("\r\n");
  ok(lines[lines.length - 1] === "", "ends with CRLF");
  ok(!/[^\r]\n/.test(ics), "no bare LF");
  for (const l of lines) ok(enc.encode(l).length <= 75, `line over 75 octets: ${enc.encode(l).length}`);
  const unfolded = ics.replace(/\r\n /g, "");
  ok(/DTSTART:20260922T090000\r\n/.test(unfolded), "DTSTART is 3 days out at 09:00, floating");
  ok(/DTEND:20260922T093000\r\n/.test(unfolded), "DTEND");
  ok((unfolded.match(/BEGIN:VEVENT/g) ?? []).length === 1, "exactly one event");
  ok(!/RRULE/.test(unfolded), "no recurrence");
  const summary = /SUMMARY:(.*)\r\n/.exec(unfolded)![1];
  // Every ; and , in the value must be preceded by a backslash.
  ok(!/(^|[^\\])(\\\\)*[;,]/.test(summary), `unescaped ; or , in summary: ${summary}`);
  ok(!/[\x00-\x08\x0B-\x1F]/.test(unfolded.replace(/\r\n/g, "")), "no control characters");
  // Unfolding a folded line must give back valid UTF-8 (no split characters).
  ok(!ics.includes("�"), "no replacement characters");
}

ok(followUpStart(new Date(2026, 11, 30, 23, 59)).toDateString() === new Date(2027, 0, 2).toDateString(), "year rollover");
ok(followUpStart(new Date(2026, 10, 1, 12)).getHours() === 9, "9:00 local across DST end");
ok(followUpStart(new Date(2026, 1, 27)).getMonth() === 2, "month rollover");

console.log(describeFollowUp(new Date(2026, 8, 19)), "|", icsFileName("Bio 101: Cells & Membranes!"), icsFileName("光合作用"), icsFileName(""));
console.log(
  buildFollowUpIcs({
    lectureId: "abc",
    lectureTitle: "Bio 101, Week 3",
    lectureUrl: "https://x.example/lectures/abc",
    now: new Date(2026, 8, 19, 15, 30),
  })
);
console.log(fail ? `${fail} FAILED` : "all ics checks passed");
process.exit(fail ? 1 : 0);
