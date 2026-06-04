"use client";

import { useState, useTransition, type FormEvent } from "react";
import { GlassCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminCreateUser } from "@/lib/actions/admin";

/** Alta de usuario con contraseña TEMPORAL (sin invitación por email mientras DEBT-0008/SMTP siga abierta). */
export function CreateUser() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [pwd, setPwd] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function gen() {
    setPwd(`Rc-${crypto.randomUUID().slice(0, 8)}`);
  }

  function handle(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    start(async () => {
      const r = await adminCreateUser(email.trim(), pwd, fullName.trim());
      if (!r.ok) return setErr(r.error ?? "Error");
      setMsg(`Usuario creado. Entrega la contraseña temporal: ${pwd}`);
      setEmail("");
      setFullName("");
      setPwd("");
    });
  }

  return (
    <GlassCard className="p-6">
      <h2 className="mb-3 text-sm font-semibold text-fg">Crear usuario (contraseña temporal)</h2>
      <form onSubmit={handle} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Nombre"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoComplete="off"
        />
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="off"
        />
        <Input
          placeholder="Contraseña temporal"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Button type="button" variant="glass" onClick={gen} className="h-9 text-xs">Generar</Button>
        <Button type="submit" disabled={pending}>Crear</Button>
      </form>
      {err ? <p className="mt-2 text-xs text-red-500">{err}</p> : null}
      {msg ? <p className="mt-2 text-xs text-positive">{msg}</p> : null}
      <p className="mt-2 text-xs text-muted">
        Se crea con el email confirmado (sin SMTP). El usuario entra con esa contraseña; luego asígnale rol abajo.
      </p>
    </GlassCard>
  );
}
