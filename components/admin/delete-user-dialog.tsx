"use client";

import { useState, useTransition } from "react";
import { X, AlertTriangle } from "lucide-react";
import { GlassCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminDeleteUser } from "@/lib/actions/admin";

/**
 * Diálogo DESTRUCTIVO de eliminación de usuario. Exige re-autenticación por contraseña del admin
 * antes de borrar (el servidor también lo verifica). Advertencia explícita: borra todo el histórico.
 */
export function DeleteUserDialog({
  userId,
  userLabel,
  onClose,
}: {
  userId: string;
  userLabel: string;
  onClose: () => void;
}) {
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirm() {
    setErr(null);
    start(async () => {
      const r = await adminDeleteUser(userId, pwd);
      if (!r.ok) setErr(r.error ?? "Error");
      else onClose(); // revalida /admin → la fila desaparece
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <GlassCard className="w-full max-w-sm p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-red-500">
            <AlertTriangle size={16} /> Eliminar usuario
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-muted transition hover:text-fg">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-fg">
          Vas a eliminar a <span className="font-semibold">{userLabel}</span> y{" "}
          <span className="font-semibold">todo su histórico</span> (tareas, instancias, métricas). Es{" "}
          <span className="font-semibold">permanente</span> e irreversible.
        </p>

        <label htmlFor="admin-pwd" className="mt-4 block text-xs text-muted">
          Escribe TU contraseña de admin para confirmar:
        </label>
        <Input
          id="admin-pwd"
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          className="mt-1"
          autoComplete="current-password"
          placeholder="Tu contraseña"
        />
        {err ? <p className="mt-2 text-xs text-red-500">{err}</p> : null}

        <div className="mt-5 flex gap-2">
          <Button variant="glass" className="flex-1" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            className="flex-1 bg-red-500 text-white hover:brightness-110"
            onClick={confirm}
            disabled={pending || !pwd}
          >
            Eliminar definitivamente
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
