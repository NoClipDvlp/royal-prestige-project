import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <AuthShell
      title="Iniciar sesión"
      subtitle="Accede a tu panel de Royal Control."
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link href="/signup" className="font-medium text-accent">
            Regístrate
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
