import { AuthShell } from "@/components/auth/auth-shell";
import { ResetForm } from "@/components/auth/reset-form";

// Ruta pública (prefijo /auth/* del routing). Dos modos:
//  - request (por defecto): pide email → resetPasswordForEmail.
//  - update (?mode=update, tras el enlace de recuperación + callback): updateUser({password}).
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const update = mode === "update";

  return (
    <AuthShell
      title={update ? "Nueva contraseña" : "Restablecer contraseña"}
      subtitle={update ? "Elige una nueva contraseña." : "Te enviaremos un enlace por email."}
    >
      <ResetForm mode={update ? "update" : "request"} />
    </AuthShell>
  );
}
