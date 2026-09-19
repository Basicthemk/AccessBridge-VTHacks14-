import { getTranslations } from "next-intl/server";
import AuthShell from "@/components/AuthShell";
import AuthForm from "@/components/AuthForm";

export async function generateMetadata() {
  const t = await getTranslations("Auth");
  return { title: t("metaSignIn") };
}

export default function LoginPage() {
  return (
    <AuthShell>
      <AuthForm mode="login" />
    </AuthShell>
  );
}
