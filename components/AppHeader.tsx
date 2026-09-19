import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { applyDefaultScript } from "@/lib/dyslexia-mode";
import DyslexiaToggle from "@/components/DyslexiaToggle";

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

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: applyDefaultScript(defaultOn) }} />
      <header className="mx-auto max-w-6xl px-3 pt-5 md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <Link href="/dashboard" className="font-heading text-2xl font-semibold text-primary-dark">
            AccessBridge
          </Link>
          <nav aria-label="Account" className="flex flex-wrap items-center gap-3">
            <DyslexiaToggle defaultOn={defaultOn} />
            <form action="/auth/signout" method="post">
              <button className="rounded-md border-2 border-accent px-3 py-2 font-bold text-accent hover:bg-accent hover:text-surface">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
    </>
  );
}
