import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { applyDefaultScript } from "@/lib/dyslexia-mode";
import DyslexiaToggle from "@/components/DyslexiaToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";

// Renders the banner landmark. Pages put their <main id="main"> after it, not inside it.
export default async function AppHeader() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("disability_profile").eq("id", user.id).maybeSingle()
    : { data: null };
  const defaultOn = profile?.disability_profile === "dyslexia";
  const t = await getTranslations("Header");

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: applyDefaultScript(defaultOn) }} />
      <header className="mx-auto max-w-6xl px-3 pt-4 md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <Link href="/dashboard" className="inline-flex items-center gap-2 font-heading text-xl font-semibold text-primary-dark">
            {/* The mark is decorative: the name beside it is real text, so it keeps the page font. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/icon-transparent.svg" alt="" width={32} height={32} className="h-5 w-5" />
            AccessBridge
          </Link>
          <nav aria-label={t("account")} className="flex flex-wrap items-center gap-2">
            <LanguageSwitcher />
            <DyslexiaToggle defaultOn={defaultOn} />
            <form action="/auth/signout" method="post">
              <button className="btn btn-quiet">
                {t("signOut")}
              </button>
            </form>
          </nav>
        </div>
      </header>
    </>
  );
}
