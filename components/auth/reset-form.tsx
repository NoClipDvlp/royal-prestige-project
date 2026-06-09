"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { changeOwnPassword } from "@/lib/actions/account";

export function ResetForm({ mode }: { mode: "request" | "update" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const next = encodeURIComponent("/auth/reset?mode=update");
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${next}`,
    });
    setLoading(false);
    setMsg("Si el email existe, te enviamos un enlace para restablecer tu contraseña.");
  }

  async function handleUpdate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // changeOwnPassword: actualiza la clave + limpia must_set_password + manda aviso de seguridad.
    const r = await changeOwnPassword(password);
    if (!r.ok) {
      setLoading(false);
      setError(r.error ?? "No se pudo actualizar. Abre de nuevo el enlace del email.");
      return;
    }
    // Refrescar el JWT para que traiga app_metadata sin el flag → la app deja de forzar la pantalla.
    await createSupabaseBrowserClient().auth.refreshSession();
    setLoading(false);
    router.replace("/");
    router.refresh();
  }

  if (mode === "update") {
    return (
      <form onSubmit={handleUpdate} className="space-y-3">
        <Field label="Nueva contraseña" htmlFor="rs-pwd" hint="Mínimo 8 caracteres.">
          <PasswordInput
            id="rs-pwd"
            placeholder="Nueva contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Guardando…" : "Guardar contraseña"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleRequest} className="space-y-3">
      <Field label="Correo" htmlFor="rs-email">
        <Input
          id="rs-email"
          type="email"
          placeholder="tucorreo@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </Field>
      {msg ? <p className="text-xs text-positive">{msg}</p> : null}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Enviando…" : "Enviar enlace"}
      </Button>
    </form>
  );
}
