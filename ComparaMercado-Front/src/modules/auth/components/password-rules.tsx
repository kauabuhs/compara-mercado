import { Check, Circle } from "lucide-react";
import { passwordRules } from "@/lib/password";
import { cn } from "@/lib/utils";

/** Requisitos da senha com o estado de cada um enquanto a pessoa digita. */
export function PasswordRules({ password, id }: { password: string; id: string }) {
  return (
    <ul id={id} className="space-y-1 text-sm">
      {passwordRules(password).map((rule) => (
        <li
          key={rule.id}
          className={cn(
            "flex items-center gap-2 transition-colors",
            rule.met ? "text-success-soft-foreground" : "text-muted-foreground",
          )}
        >
          {rule.met ? (
            <Check aria-hidden className="size-4 shrink-0" />
          ) : (
            <Circle aria-hidden className="size-4 shrink-0" />
          )}
          <span>
            {rule.label}
            <span className="sr-only">{rule.met ? " (atendido)" : " (pendente)"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
