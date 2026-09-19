import { getTranslations } from "next-intl/server";
import AppHeader from "@/components/AppHeader";
import UploadForm from "@/components/UploadForm";

export async function generateMetadata() {
  const t = await getTranslations("UploadPage");
  return { title: t("meta") };
}

export default async function UploadPage() {
  const t = await getTranslations("UploadPage");
  return (
    <>
      <AppHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-3 pb-7 pt-6 md:px-5">
      <div className="split gap-y-5">
        <div className="split-side">
          <h1 className="text-4xl font-semibold text-balance">{t("title")}</h1>
          <p className="mt-3">
            {t("intro")}
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
