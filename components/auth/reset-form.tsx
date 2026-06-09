"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { changeOwnPassword, requestPasswordOtp } from "@/lib/actions/account";

/**
 * Restablecer / establecer contraseña por CÓDIGO OTP (ADR-0023). Tres modos:
 *  - request: pide el email → envía un código de 6 dígitos → pasa al paso "code".
 *  - otp: (desde el correo de alta/reset, email prefijado) teclea el código → verifyOtp → fija la contraseña.
 *  - update: (gate del middleware, sesión ya activa) solo fija la nueva contraseña.
 * verifyOtp establece sesión SIN code_verifier de PKCE → inmune al fallo de los enlaces de servidor.
 */
export function ResetForm({ mode, email: emailProp }: { mode: "request" | "otp" | "update"; email?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code" | "update">(
    mode === "update" ? "update" : mode === "otp" ? "code" : "email",
  );
  const [email, setEmail] = useState(emailProp ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Sesión ya establecida (verifyOtp o gate) → fija clave + limpia must_set_password + aviso de seguridad.
  async function finishWithSession(pwd: string) {
    const r = await changeOwnPassword(pwd);
    if (!r.ok) {
      setLoading(false);
      setError(r.error ?? "No se pudo guardar la contraseña.");
      return;
    }
    await createSupabaseBrowserClient().auth.refreshSession();
    setLoading(false);
    router.replace("/");
    router.refresh();
  }

  // request: pedir el código
  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    await requestPasswordOtp(email);
    setLoading(false);
    setMsg("Si el email existe, te enviamos un código de 6 dígitos. Revísalo e ingrésalo abajo.");
    setStep("code");
  }

  // code: verificar OTP y fijar contraseña
  async function handleCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error: vErr } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "recovery" });
    if (vErr) {
      setLoading(false);
      setError("Código inválido o expirado. Pide uno nuevo.");
      return;
    }
    await finishWithSession(password);
  }

  // update: sesión activa (gate del middleware)
  async function handleUpdate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    await finishWithSession(password);
  }

  async function resend() {
    setError(null);
    await requestPasswordOtp(email);
    setMsg("Te enviamos un nuevo código.");
  }

  if (step === "update") {
    return (
      <form onSubmit={handleUpdate} className="space-y-3">
        <Field label="Nueva contraseña" htmlFor="rs-pwd" hint="Mínimo 8 caracteres.">
          <PasswordInput id="rs-pwd" placeholder="Nueva contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        </Field>
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Guardando…" : "Guardar contraseña"}
        </Button>
      </form>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={handleCode} className="space-y-3">
        <Field label="Correo" htmlFor="rs-email">
          <Input id="rs-email" type="email" placeholder="tucorreo@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>
        <Field label="Código de 6 dígitos" htmlFor="rs-code" hint="Te lo enviamos por correo.">
          <Input
            id="rs-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
            minLength={6}
            maxLength={6}
            className="text-center text-lg tracking-[0.5em]"
          />
        </Field>
        <Field label="Nueva contraseña" htmlFor="rs-pwd2" hint="Mínimo 8 caracteres.">
          <PasswordInput id="rs-pwd2" placeholder="Nueva contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        </Field>
        {msg ? <p className="text-xs text-positive">{msg}</p> : null}
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading || code.length < 6}>
          {loading ? "Verificando…" : "Verificar y guardar"}
        </Button>
        <button type="button" onClick={resend} className="w-full text-center text-xs text-muted transition hover:text-fg">
          Reenviar código
        </button>
      </form>
    );
  }

  // step === "email"
  return (
    <form onSubmit={handleRequest} className="space-y-3">
      <Field label="Correo" htmlFor="rs-email">
        <Input id="rs-email" type="email" placeholder="tucorreo@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </Field>
      {msg ? <p className="text-xs text-positive">{msg}</p> : null}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Enviando…" : "Enviar código"}
      </Button>
    </form>
  );
}
