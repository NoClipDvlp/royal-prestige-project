"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError("Email o contraseña incorrectos.");
      return;
    }
    // ERROR 2 (ADR-0022): el ADMIN es SINGLE-SESSION. Tras login, si el rol es admin, cierra las DEMÁS
    // sesiones (otros dispositivos/navegadores) conservando esta. Auditor/distribuidor son multidevice → no
    // se tocan. (RLS self: solo lee su propia fila.) Best-effort: un fallo aquí no debe impedir entrar.
    try {
      const uid = data.user?.id;
      if (uid) {
        const { data: prof } = await supabase.from("users").select("role").eq("id", uid).maybeSingle();
        if (prof?.role === "admin") await supabase.auth.signOut({ scope: "others" });
      }
    } catch {
      /* best-effort */
    }
    setLoading(false);
    router.replace("/");
    router.refresh();
  }

  async function handleGoogle() {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function handleForgot() {
    if (!email) {
      setError("Escribe tu email y vuelve a pulsar “¿Olvidaste tu contraseña?”.");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const next = encodeURIComponent("/auth/reset?mode=update");
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${next}`,
    });
    setResetMsg("Si el email existe, te enviamos un enlace para restablecer tu contraseña.");
  }

  return (
    <form onSubmit={handleLogin} className="space-y-3">
      <Field label="Correo" htmlFor="login-email">
        <Input
          id="login-email"
          type="email"
          placeholder="tucorreo@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </Field>
      <Field label="Contraseña" htmlFor="login-password">
        <PasswordInput
          id="login-password"
          placeholder="Tu contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </Field>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      {resetMsg ? <p className="text-xs text-positive">{resetMsg}</p> : null}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Entrando…" : "Entrar"}
      </Button>
      <Button type="button" variant="glass" className="w-full" onClick={handleGoogle}>
        Continuar con Google
      </Button>
      <button
        type="button"
        onClick={handleForgot}
        className="w-full text-center text-xs text-muted transition hover:text-fg"
      >
        ¿Olvidaste tu contraseña?
      </button>
    </form>
  );
}
