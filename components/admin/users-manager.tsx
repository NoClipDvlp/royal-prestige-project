"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useDensity } from "@/components/ui/density";
import { GlassCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { densityClasses } from "@/lib/density";
import { assignUserRole, updateUserName, adminResetPassword } from "@/lib/actions/admin";
import { UserTasks } from "@/components/admin/user-tasks";
import { DeleteUserDialog } from "@/components/admin/delete-user-dialog";
import type { AppRole } from "@/lib/auth/server";

export type AdminUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole | null;
  distribution_id: string | null;
};
export type Dist = { id: string; name: string };

const ROLES = [
  { value: "", label: "Sin rol" },
  { value: "distributor", label: "Distribuidor" },
  { value: "auditor", label: "Auditor" },
  { value: "admin", label: "Admin" },
] as const;

export function UsersManager({
  users,
  distributions,
  currentAdminId,
}: {
  users: AdminUser[];
  distributions: Dist[];
  currentAdminId: string;
}) {
  const { density } = useDensity();
  const d = densityClasses(density);
  return (
    <GlassCard className={d.cardPad}>
      <h2 className="mb-4 text-sm font-semibold text-fg">Usuarios</h2>
      {users.length === 0 ? (
        <p className="text-sm text-muted">No hay usuarios todavía.</p>
      ) : (
        <ul className={cn("flex flex-col", d.rowGap)}>
          {users.map((u) => (
            <UserRow key={u.id} user={u} distributions={distributions} currentAdminId={currentAdminId} />
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

function UserRow({
  user,
  distributions,
  currentAdminId,
}: {
  user: AdminUser;
  distributions: Dist[];
  currentAdminId: string;
}) {
  const { density } = useDensity();
  const d = densityClasses(density);
  const [name, setName] = useState(user.full_name ?? "");
  const [role, setRole] = useState<string>(user.role ?? "");
  const [dist, setDist] = useState<string>(user.distribution_id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const needsDist = role === "distributor";

  const [confirmDelete, setConfirmDelete] = useState(false);
  const isSelf = user.id === currentAdminId;

  // Dirty-check: "Guardar" solo se habilita si hay un cambio real respecto al valor original.
  const dirty =
    name !== (user.full_name ?? "") ||
    role !== (user.role ?? "") ||
    dist !== (user.distribution_id ?? "");

  function save() {
    setMsg(null);
    start(async () => {
      const r1 = await assignUserRole(user.id, (role || null) as AppRole | null, dist || null);
      if (!r1.ok) return setMsg(r1.error ?? "Error");
      if (name !== (user.full_name ?? "")) {
        const r2 = await updateUserName(user.id, name);
        if (!r2.ok) return setMsg(r2.error ?? "Error");
      }
      setMsg("Guardado ✓");
    });
  }

  function reset() {
    setMsg(null);
    const temp = `Rc-${crypto.randomUUID().slice(0, 8)}`;
    start(async () => {
      const r = await adminResetPassword(user.id, temp);
      setMsg(r.ok ? `Contraseña temporal: ${temp}` : (r.error ?? "Error"));
    });
  }

  return (
    <li className={cn("flex flex-col gap-2 border-b border-white/30 last:border-0 dark:border-white/10 sm:flex-row sm:flex-wrap sm:items-start", d.compact ? "pb-2" : "pb-3")}>
      <div className="flex-1">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-1"
          aria-label="Nombre"
          autoComplete="off"
        />
        <span className="text-xs text-muted">{user.email ?? "—"}</span>
      </div>
      <Select
        value={role}
        onChange={(e) => {
          setRole(e.target.value);
          if (e.target.value !== "distributor") setDist("");
        }}
        aria-label="Rol"
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </Select>
      <Select
        value={dist}
        onChange={(e) => setDist(e.target.value)}
        disabled={!needsDist}
        aria-label="Distribución"
      >
        <option value="">{needsDist ? "Elige distribución…" : "—"}</option>
        {distributions.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
      <div className="flex gap-2">
        <Button onClick={save} disabled={pending || !dirty} size="sm">Guardar</Button>
        <Button variant="secondary" onClick={reset} disabled={pending} size="sm">Reset</Button>
        {!isSelf ? (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
            aria-label="Eliminar usuario"
            className="px-2.5"
          >
            <Trash2 size={14} />
          </Button>
        ) : null}
      </div>
      {msg ? <span className="text-xs text-muted sm:basis-full">{msg}</span> : null}

      <UserTasks userId={user.id} />

      {confirmDelete ? (
        <DeleteUserDialog
          userId={user.id}
          userLabel={user.full_name || user.email || "este usuario"}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}
    </li>
  );
}
