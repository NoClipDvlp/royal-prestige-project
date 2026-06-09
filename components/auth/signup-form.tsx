"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { checkEmailAvailable } from "@/lib/actions/account";

export function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [distribution, setDistribution] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mismatch = password2.length > 0 && password !== password2; // feedback en vivo (#15)

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    // B6: bloquear email ya registrado (Supabase, con confirm-email, no devuelve error → lo chequeamos).
    const { available } = await checkEmailAvailable(email);
    if (!available) {
      setLoading(false);
      setError("Ese email ya está registrado. Inicia sesión o recupera tu contraseña.");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // Contrato con el trigger handle_new_user (0002): claves full_name + desired_distribution.
        data: { full_name: fullName, desired_distribution: distribution },
      },
    });
    setLoading(false);
    if (error) {
      setError("No se pudo registrar. ¿Quizás ya tienes una cuenta con ese email?");
      return;
    }
    router.replace("/signup?sent=1"); // PRG → muestra el aviso "revisa tu email"
  }

  return (
    <form onSubmit={handleSignup} className="space-y-3">
      <Field label="Nombre completo" htmlFor="su-name">
        <Input
          id="su-name"
          placeholder="Tu nombre y apellido"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoComplete="name"
        />
      </Field>
      <Field label="Distribución" htmlFor="su-dist">
        <Input
          id="su-dist"
          placeholder="Nombre de tu distribución"
          value={distribution}
          onChange={(e) => setDistribution(e.target.value)}
          required
        />
      </Field>
      <Field label="Correo" htmlFor="su-email">
        <Input
          id="su-email"
          type="email"
          placeholder="tucorreo@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </Field>
      <Field label="Contraseña" htmlFor="su-pwd" hint="Mínimo 8 caracteres.">
        <PasswordInput
          id="su-pwd"
          placeholder="Crea una contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </Field>
      <Field label="Repetir contraseña" htmlFor="su-pwd2" error={mismatch ? "Las contraseñas no coinciden." : null}>
        <PasswordInput
          id="su-pwd2"
          placeholder="Repite la contraseña"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </Field>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={loading || mismatch}>
        {loading ? "Creando…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
