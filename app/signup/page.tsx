import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { CheckEmailNotice } from "@/components/auth/check-email-notice";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  if (sent === "1") {
    return (
      <AuthShell title="Revisa tu email" subtitle="Te enviamos un enlace de confirmación.">
        <CheckEmailNotice />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Crear cuenta"
      subtitle="Regístrate; un administrador te asignará rol y distribución."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-accent">
            Inicia sesión
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
