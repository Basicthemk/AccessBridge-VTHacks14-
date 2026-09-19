import Link from "next/link";

export default function AppHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <Link href="/dashboard" className="font-heading text-2xl font-semibold text-primary">
        AccessBridge
      </Link>
      <form action="/auth/signout" method="post">
        <button className="rounded-md border-2 border-accent px-3 py-2 font-bold text-accent hover:bg-accent hover:text-surface">
          Sign out
        </button>
      </form>
    </header>
  );
}
