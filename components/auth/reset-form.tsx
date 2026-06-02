"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError("No se pudo actualizar. Abre de nuevo el enlace del email.");
      return;
    }
    router.replace("/");
  }

  if (mode === "update") {
    return (
      <form onSubmit={handleUpdate} className="space-y-3">
        <Input
          type="password"
          placeholder="Nueva contraseña (mín. 8)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Guardando…" : "Guardar contraseña"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleRequest} className="space-y-3">
      <Input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
      />
      {msg ? <p className="text-xs text-positive">{msg}</p> : null}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Enviando…" : "Enviar enlace"}
      </Button>
    </form>
  );
}
