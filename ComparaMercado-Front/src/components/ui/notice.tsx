import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONES = {
  info: { icon: Info, className: "bg-info-soft text-info-soft-foreground" },
  success: { icon: CircleCheck, className: "bg-success-soft text-success-soft-foreground" },
  warning: { icon: CircleAlert, className: "bg-warning-soft text-warning-soft-foreground" },
} as const;

/** Faixa de aviso no topo de uma tela (resultado de uma ação, motivo de um redirecionamento). */
export function Notice({
  tone = "info",
  children,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  const { icon: Icon, className } = TONES[tone];
  return (
    <div
      role={tone === "warning" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-2xl px-4 py-3 text-sm", className)}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
