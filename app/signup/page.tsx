import { getTranslations } from "next-intl/server";
import AuthShell from "@/components/AuthShell";
import AuthForm from "@/components/AuthForm";

export async function generateMetadata() {
  const t = await getTranslations("Auth");
  return { title: t("metaSignUp") };
}

export default function SignupPage() {
  return (
    <AuthShell>
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
