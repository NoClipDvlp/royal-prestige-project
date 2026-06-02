import { AuthShell } from "@/components/auth/auth-shell";
import { getUser } from "@/lib/auth/server";

// Pantalla de onboarding para usuarios autenticados sin rol (SPEC §5). Solo el mensaje + saludo;
// sin acceso a datos de negocio (lo bloquea la RLS) ni edición de perfil. El middleware enruta aquí.
export default async function SinRolPage() {
  const user = await getUser();
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? null;

  return (
    <AuthShell
      title={fullName ? `Hola, ${fullName}` : "Hola"}
      subtitle="Tu cuenta está casi lista."
    >
      <div className="space-y-3 text-sm text-muted">
        <p>
          Contáctate con tu administrador para que te asigne una{" "}
          <span className="font-medium text-fg">licencia o rol</span>.
        </p>
        <p>En cuanto tengas rol, este panel se desbloquea automáticamente.</p>
      </div>
    </AuthShell>
  );
}
