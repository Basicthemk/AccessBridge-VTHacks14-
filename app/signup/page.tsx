import AuthShell from "@/components/AuthShell";
import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Create account · AccessBridge" };

export default function SignupPage() {
  return (
    <AuthShell>
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
