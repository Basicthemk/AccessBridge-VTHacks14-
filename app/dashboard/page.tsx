import { createClient } from "@/lib/supabase/server";
import { PROFILES } from "@/lib/profiles";

export const metadata = { title: "Your lectures · AccessBridge" };

export default async function Dashboard() {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  const profile = PROFILES.find(
    (p) => p.value === user?.user_metadata?.disability_profile
  );

  return (
    <main className="mx-auto max-w-6xl px-3 py-5 md:px-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <p className="font-heading text-2xl font-semibold text-primary">AccessBridge</p>
        <form action="/auth/signout" method="post">
          <button className="rounded-md border-2 border-accent px-3 py-2 font-bold text-accent hover:bg-accent hover:text-surface">
            Sign out
          </button>
        </form>
      </header>

      <h1 className="mt-5 text-4xl font-semibold">Your lectures</h1>
      <p className="mt-2">
        Signed in as <strong>{user?.email}</strong>. Study profile:{" "}
        <strong>{profile?.label ?? "Not set"}</strong>.
      </p>
      <p className="mt-4 rounded-lg border border-border bg-surface p-4">
        Lecture upload arrives in the next phase.
      </p>
    </main>
  );
}
