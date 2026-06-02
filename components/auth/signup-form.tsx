"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [distribution, setDistribution] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
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
      <Input
        placeholder="Nombre completo"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        required
        autoComplete="name"
      />
      <Input
        placeholder="Nombre de tu distribución"
        value={distribution}
        onChange={(e) => setDistribution(e.target.value)}
        required
      />
      <Input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
      />
      <Input
        type="password"
        placeholder="Contraseña (mín. 8)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        autoComplete="new-password"
      />
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Creando…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
