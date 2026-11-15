import type { FeedOrigin, FeedTrust } from "@contracts";
import { BadgeCheck, CircleCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/primitives";

const TRUST: Record<
  FeedTrust,
  { label: string; tone: "brand" | "success" | "warning"; icon: typeof BadgeCheck }
> = {
  official: { label: "Oficial", tone: "brand", icon: BadgeCheck },
  confirmed: { label: "Confirmado", tone: "success", icon: CircleCheck },
  unconfirmed: { label: "Aguardando confirmação", tone: "warning", icon: Clock },
};

const ORIGIN_NOTE: Partial<Record<FeedOrigin, string>> = {
  flyer: "via encarte",
  store: "publicado pelo mercado",
  team: "equipe Compara Mercado",
};

/**
 * Selo de confiança de uma publicação: *Oficial* (do próprio mercado), *Confirmado* (aprovado pela
 * comunidade ou pela equipe) ou *Aguardando confirmação*. A decisão vem pronta da API; aqui só
 * se apresenta. O texto vem junto do ícone para não depender só da cor (acessibilidade).
 */
export function TrustBadge({ trust }: { trust: FeedTrust }) {
  const { label, tone, icon: Icon } = TRUST[trust];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden className="size-3.5" />
      {label}
    </Badge>
  );
}

/** "via encarte" etc. Publicações da comunidade não precisam de nota: o autor já aparece. */
export function originNote(origin: FeedOrigin): string | null {
  return ORIGIN_NOTE[origin] ?? null;
}
