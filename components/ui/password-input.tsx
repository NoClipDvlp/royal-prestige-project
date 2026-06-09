"use client";

import { useState, type InputHTMLAttributes, type Ref } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

/**
 * Input de contraseña con ojito ver/ocultar (#14 QA Tanda 2). Alterna type password↔text. Reusable en
 * login, registro, cambio de clave y admin. El botón hereda el focus-visible global (Tanda 5).
 */
export function PasswordInput({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={show ? "text" : "password"} className={cn("pr-10", className)} {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={show}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md text-muted transition hover:text-fg"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
