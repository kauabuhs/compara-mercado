import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { RowContent, rowClass } from "@/components/ui/controls";
import { GroupRow, IconTile } from "@/components/ui/primitives";

/**
 * Linha de uma lista agrupada que leva a outra tela. O tom do ladrilho tem significado em toda a
 * conta: verde = suas coisas no app, azul = conta e administração, cinza = privacidade.
 */
export function LinkRow({
  href,
  icon,
  tone,
  title,
  description,
  trailing,
}: {
  href: string;
  icon: LucideIcon;
  tone: "brand" | "info" | "neutral";
  title: string;
  description?: string;
  trailing?: string;
}) {
  return (
    <GroupRow>
      <Link href={href} className={rowClass}>
        <RowContent
          icon={<IconTile icon={icon} tone={tone} />}
          title={title}
          description={description}
          trailing={trailing}
          chevron
        />
      </Link>
    </GroupRow>
  );
}
