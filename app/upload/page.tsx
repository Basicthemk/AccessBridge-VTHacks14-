import AppHeader from "@/components/AppHeader";
import UploadForm from "@/components/UploadForm";

export const metadata = { title: "Upload a lecture · AccessBridge" };

export default function UploadPage() {
  return (
    <main className="mx-auto max-w-6xl px-3 py-5 md:px-5">
      <AppHeader />
      <div className="mx-auto mt-5 max-w-prose">
        <h1 className="text-4xl font-semibold">Upload a lecture</h1>
        <p className="mb-4 mt-2">
          Add a recording and we’ll keep it safe in your private library. Only you can open it.
        </p>
        <UploadForm />
      </div>
    </main>
  );
}
