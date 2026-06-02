"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Email o contraseña incorrectos.");
      return;
    }
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
        placeholder="Contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="current-password"
      />
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
