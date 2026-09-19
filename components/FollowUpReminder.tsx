"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { buildFollowUpIcs, describeFollowUp, icsFileName } from "@/lib/calendar";

const outlineBtn = "btn btn-outline";

export default function FollowUpReminder({ lectureId, lectureTitle }: { lectureId: string; lectureTitle: string }) {
  const t = useTranslations("FollowUp");
  const locale = useLocale();
  // Worked out in the browser so "in three days" uses the student's own clock and time zone.
  const [when, setWhen] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [problem, setProblem] = useState(false);

  useEffect(() => setWhen(describeFollowUp(new Date(), locale)), [locale]);

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
      setAnnounce(t("downloaded", { file: a.download, when: describeFollowUp(now, locale) }));
    } catch {
      setProblem(true);
      setAnnounce("");
    }
  }

  return (
    <div className="max-w-prose">
      <p>
        {t("intro")}
        {when && (
          <>
            {" "}
            {t.rich("setFor", { when, b: (chunks) => <strong>{chunks}</strong> })}
          </>
        )}
      </p>
      <button type="button" onClick={download} className={`${outlineBtn} mt-3`}>
        {t("button")}
      </button>
      <p role="status" className="mt-2">{announce}</p>
      {problem && (
        <p role="alert" className="callout-error mt-2 inline-flex max-w-prose">
          {t("problem")}
        </p>
      )}
    </div>
  );
}
