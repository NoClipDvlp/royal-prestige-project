"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { changeOwnPassword } from "@/lib/actions/account";

/** Cambiar contraseña estando autenticado (#10). updateUser({password}) — sin email. Con repetir + validación. */
export function ChangePassword() {
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mismatch = pwd2.length > 0 && pwd !== pwd2;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (pwd !== pwd2) {
      setErr("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    const r = await changeOwnPassword(pwd); // actualiza + aviso de seguridad por correo
    setLoading(false);
    if (!r.ok) {
      setErr(r.error ?? "No se pudo cambiar la contraseña.");
      return;
    }
    setMsg("Contraseña actualizada. Te enviamos un aviso de seguridad por correo.");
    setPwd("");
    setPwd2("");
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Nueva contraseña" htmlFor="cp-1" hint="Mínimo 8 caracteres.">
        <PasswordInput id="cp-1" value={pwd} onChange={(e) => setPwd(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="Nueva contraseña" />
      </Field>
      <Field label="Repetir contraseña" htmlFor="cp-2" error={mismatch ? "Las contraseñas no coinciden." : null}>
        <PasswordInput id="cp-2" value={pwd2} onChange={(e) => setPwd2(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="Repite la contraseña" />
      </Field>
      {err ? <p className="text-xs text-red-500">{err}</p> : null}
      {msg ? <p className="text-xs text-positive">{msg}</p> : null}
      <Button type="submit" disabled={loading || mismatch}>{loading ? "Guardando…" : "Cambiar contraseña"}</Button>
    </form>
  );
}
