"use client";

import { useEffect, useState } from "react";
import { buildFollowUpIcs, describeFollowUp, icsFileName } from "@/lib/calendar";

const outlineBtn = "btn btn-outline";

export default function FollowUpReminder({ lectureId, lectureTitle }: { lectureId: string; lectureTitle: string }) {
  // Worked out in the browser so "in three days" uses the student's own clock and time zone.
  const [when, setWhen] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [problem, setProblem] = useState(false);

  useEffect(() => setWhen(describeFollowUp(new Date())), []);

  function download() {
    try {
      const now = new Date();
      const ics = buildFollowUpIcs({ lectureId, lectureTitle, lectureUrl: window.location.href, now });
      const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = icsFileName(lectureTitle);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setProblem(false);
      setAnnounce(`Downloaded ${a.download}. Open it to add the reminder for ${describeFollowUp(now)} to your calendar.`);
    } catch {
      setProblem(true);
      setAnnounce("");
    }
  }

  return (
    <div className="max-w-prose">
      <p>
        Add a reminder to check for your professor’s reply. It’s a calendar file you open yourself; nothing is shared.
        {when && (
          <>
            {" "}
            It’s set for <strong>{when}</strong>, your time.
          </>
        )}
      </p>
      <button type="button" onClick={download} className={`${outlineBtn} mt-3`}>
        Add follow-up to calendar
      </button>
      <p role="status" className="mt-2">{announce}</p>
      {problem && (
        <p role="alert" className="callout-error mt-2 inline-flex max-w-prose">
          Problem: We couldn’t make the calendar file. Try again.
        </p>
      )}
    </div>
  );
}
