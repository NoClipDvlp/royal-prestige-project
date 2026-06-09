"use client";

import { useState, useTransition, type FormEvent } from "react";
import { GlassCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { adminCreateUser } from "@/lib/actions/admin";
import type { AppRole } from "@/lib/auth/server";

type Dist = { id: string; name: string };

const ROLES = [
  { value: "distributor", label: "Distribuidor" },
  { value: "auditor", label: "Auditor" },
  { value: "admin", label: "Admin" },
] as const;

/**
 * Alta de usuario ATÓMICA con rol (#3): nombre + email + rol (+ distribución si distribuidor). Al crear se
 * envía un correo con un enlace para que el usuario establezca su contraseña. Sin credencial en texto.
 */
export function CreateUser({ distributions }: { distributions: Dist[] }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>("distributor");
  const [dist, setDist] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const needsDist = role === "distributor";

  function handle(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (needsDist && !dist) {
      setErr("Elige una distribución para el distribuidor.");
      return;
    }
    start(async () => {
      const r = await adminCreateUser(email.trim(), fullName.trim(), role as AppRole, needsDist ? dist : null);
      if (!r.ok) return setErr(r.error ?? "Error");
      setMsg(`Listo. Enviamos a ${email.trim()} un enlace para establecer su contraseña.`);
      setEmail("");
      setFullName("");
      setRole("distributor");
      setDist("");
    });
  }

  return (
    <GlassCard className="p-6">
      <h2 className="mb-3 text-sm font-semibold text-fg">Crear usuario</h2>
      <form onSubmit={handle} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="cu-name">
            <Input id="cu-name" placeholder="Nombre y apellido" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="off" />
          </Field>
          <Field label="Email" htmlFor="cu-email">
            <Input id="cu-email" type="email" placeholder="correo@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
          </Field>
          <Field label="Rol" htmlFor="cu-role">
            <Select id="cu-role" className="w-full" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </Field>
          {needsDist && (
            <Field label="Distribución" htmlFor="cu-dist">
              <Select id="cu-dist" className="w-full" value={dist} onChange={(e) => setDist(e.target.value)} required>
                <option value="">Elige distribución…</option>
                {distributions.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear y enviar invitación"}</Button>
        </div>
      </form>
      {err ? <p className="mt-2 text-xs text-red-500">{err}</p> : null}
      {msg ? <p className="mt-2 text-xs text-positive">{msg}</p> : null}
      <p className="mt-2 text-xs text-muted">
        El usuario recibe un correo (FROM info@pistacore.com) con un enlace para fijar su contraseña. Requiere SMTP configurado.
      </p>
    </GlassCard>
  );
}
