import { MailCheck } from "lucide-react";

export function CheckEmailNotice() {
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-accent/15 text-accent">
        <MailCheck size={24} />
      </span>
      <p className="text-sm text-muted">
        Abre el enlace que te enviamos para <span className="font-medium text-fg">confirmar tu cuenta</span>.
        No podrás entrar hasta confirmar el email.
      </p>
    </div>
  );
}
