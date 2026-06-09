"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** Cierra sesión (#10) y vuelve a /login. `iconOnly` para el header. */
export function LogoutButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function logout() {
    start(async () => {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    });
  }

  if (iconOnly) {
    return (
      <Button variant="secondary" size="icon" onClick={logout} disabled={pending} aria-label="Cerrar sesión" className="text-muted hover:text-fg">
        <LogOut size={18} />
      </Button>
    );
  }
  return (
    <Button variant="secondary" onClick={logout} disabled={pending}>
      <LogOut size={16} /> {pending ? "Saliendo…" : "Cerrar sesión"}
    </Button>
  );
}
