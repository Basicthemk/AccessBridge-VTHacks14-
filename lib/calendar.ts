// One-event .ics file for a follow-up reminder. Pure, no browser or server imports.
// Times are "floating" (no Z, no TZID): calendars show them at the same wall-clock time
// wherever the student opens the file, which is what a 9:00 reminder should do.

export const FOLLOW_UP_DAYS = 3;
export const FOLLOW_UP_HOUR = 9;
const DURATION_MINUTES = 30;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function floating(d: Date): string {
  return `${pad(d.getFullYear(), 4)}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function utcStamp(d: Date): string {
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** RFC 5545 TEXT escaping. Line breaks become \n; other control characters are dropped. */
function escapeText(s: string): string {
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Lines over 75 octets are folded onto continuation lines that start with a space. */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // the leading space counts toward the 75
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

/** The default follow-up: FOLLOW_UP_DAYS from `now`, at FOLLOW_UP_HOUR local time. */
export function followUpStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + FOLLOW_UP_DAYS, FOLLOW_UP_HOUR, 0, 0);
}

export function buildFollowUpIcs(opts: { lectureId: string; lectureTitle: string; lectureUrl: string; now: Date }): string {
  const start = followUpStart(opts.now);
  const end = new Date(start.getTime() + DURATION_MINUTES * 60_000);
  const title = opts.lectureTitle.trim() || "your lecture";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AccessBridge//Follow-up//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${opts.lectureId}-${utcStamp(opts.now)}@accessbridge`,
    `DTSTAMP:${utcStamp(opts.now)}`,
    `DTSTART:${floating(start)}`,
    `DTEND:${floating(end)}`,
    `SUMMARY:${escapeText(`Follow up on accommodations: ${title}`)}`,
    `DESCRIPTION:${escapeText(
      `Check whether your professor replied about accommodations for "${title}", and follow up if not.\n${opts.lectureUrl}`
    )}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** A safe download name: letters, digits, dashes. */
export function icsFileName(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `follow-up-${slug || "lecture"}.ics`;
}

/** "Tue, Sep 22 at 9:00 AM", for telling the student what the file contains. */
export function describeFollowUp(now: Date): string {
  const d = followUpStart(now);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}
