import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PROFILES, type DisabilityProfile } from "@/lib/profiles";
import { localizeState, serverT } from "@/lib/server-messages";
import AppHeader from "@/components/AppHeader";
import ProfileSwitch from "@/components/ProfileSwitch";
import TranscriptStatus from "@/components/TranscriptStatus";
import { transcriptState } from "@/lib/transcript-status";

export async function generateMetadata() {
  const t = await getTranslations("Dashboard");
  return { title: t("meta") };
}
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const t = await getTranslations("Dashboard");
  const tp = await getTranslations("Profiles");
  const locale = await getLocale();
  const ts = await serverT();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The profiles table is the source of truth: it is what the app uses and what can be changed here.
  const { data: profileRow } = user
    ? await supabase.from("profiles").select("disability_profile").eq("id", user.id).maybeSingle()
    : { data: null };
  const profileValue = (profileRow?.disability_profile ?? null) as DisabilityProfile | null;
  const profile = PROFILES.find((p) => p.value === profileValue);

  const { data: lectures, error } = await supabase
    .from("lectures")
    .select("id, title, transcript, transcript_status, transcript_error, transcript_started_at, created_at")
    .order("created_at", { ascending: false });

  return (
    <>
      <AppHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-3 pb-7 pt-6 md:px-5">
      <div className="split gap-y-5">
        <div className="split-side">
          <h1 className="text-4xl font-semibold text-balance">{t("title")}</h1>
          <Link href="/upload" className="btn btn-primary mt-4">
            {t("upload")}
          </Link>
          <div className="mt-5 border-t border-border pt-4">
            <p>
              {t.rich("signedIn", {
                email: user?.email ?? "",
                profile: profile ? tp(`${profile.value}.label`) : t("notSet"),
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            <ProfileSwitch current={profileValue} />
          </div>
        </div>

        <div className="split-main">
          {error && (
            <p role="alert" className="callout-error">
              {t("loadFailed")}
            </p>
          )}

          {!error && lectures?.length === 0 && (
            <section className="rounded-lg border-2 border-dashed border-accent p-5">
              <h2 className="text-2xl font-semibold">{t("emptyTitle")}</h2>
              <p className="mt-2 max-w-prose">
                {t("emptyBody")}
              </p>
              <Link href="/upload" className="btn btn-outline mt-4">
                {t("upload")}
              </Link>
            </section>
          )}

          {lectures && lectures.length > 0 && (
            <ul className="border-b border-border">
              {lectures.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-t border-border py-4"
                >
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold">
                      <Link href={`/lectures/${l.id}`} className="text-accent underline underline-offset-4 hover:text-primary-dark">
                        {l.title}
                      </Link>
                    </h2>
                    <p className="mt-1 text-sm">
                      {t("uploaded", {
                        date: new Date(l.created_at).toLocaleDateString(locale, {
                          dateStyle: "medium",
                          timeZone: "UTC",
                        }),
                      })}
                    </p>
                  </div>
                  <TranscriptStatus lectureId={l.id} state={localizeState(ts, transcriptState(l))} title={l.title} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
    </>
  );
}
