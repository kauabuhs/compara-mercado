import { Award } from "lucide-react";
import { cn } from "@/lib/utils";

/** Nomes dos níveis de reputação (0–3); as faixas de pontos são decididas no back-end. */
export const LEVEL_LABEL = ["Novato", "Colaborador", "Confiável", "Guardião"] as const;

export function levelLabel(level: number): string {
  return LEVEL_LABEL[Math.min(LEVEL_LABEL.length - 1, Math.max(0, Math.trunc(level)))] ?? "Novato";
}

/** Nível do autor, discreto: ícone + nome. Do nível 1 em diante ganha destaque de cor. */
export function LevelBadge({ level, className }: { level: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        level >= 2 ? "font-medium text-brand-soft-foreground" : "text-muted-foreground",
        className,
      )}
    >
      <Award aria-hidden className="size-3.5" />
      {levelLabel(level)}
    </span>
  );
}
