import AppHeader from "@/components/AppHeader";
import UploadForm from "@/components/UploadForm";

export const metadata = { title: "Upload a lecture · AccessBridge" };

export default function UploadPage() {
  return (
    <>
      <AppHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-3 pb-7 pt-6 md:px-5">
      <div className="split gap-y-5">
        <div className="split-side">
          <h1 className="text-4xl font-semibold text-balance">Upload a lecture</h1>
          <p className="mt-3">
            Add a recording and we’ll keep it safe in your private library. Only you can open it.
          </p>
        </div>
        <div className="split-main">
          <UploadForm />
        </div>
      </div>
    </main>
    </>
  );
}
