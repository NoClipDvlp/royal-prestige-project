import { AuthShell } from "@/components/auth/auth-shell";
import { ResetForm } from "@/components/auth/reset-form";

// Ruta pública (prefijo /auth/* del routing). Tres modos (ADR-0023):
//  - request (por defecto): pide email → código OTP de 6 dígitos.
//  - otp (?mode=otp&email=…, desde el correo de alta/reset): teclea el código → verifyOtp → fija contraseña.
//  - update (?mode=update, gate del middleware con sesión activa): solo fija la nueva contraseña.
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; email?: string }>;
}) {
  const { mode, email } = await searchParams;
  const m = mode === "update" ? "update" : mode === "otp" ? "otp" : "request";
  const update = m === "update";

  return (
    <AuthShell
      title={update ? "Nueva contraseña" : "Restablecer contraseña"}
      subtitle={
        update
          ? "Elige una nueva contraseña."
          : m === "otp"
            ? "Escribe el código que te enviamos por correo y tu nueva contraseña."
            : "Te enviaremos un código de 6 dígitos por email."
      }
    >
      <ResetForm mode={m} email={typeof email === "string" ? email : undefined} />
    </AuthShell>
  );
}
