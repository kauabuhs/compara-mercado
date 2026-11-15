import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Atalho flutuante de ação principal, só no celular (no desktop a ação fica no cabeçalho da
 * página). Usa o mesmo vidro da pílula de navegação (`glass-float`, que já respeita
 * `prefers-reduced-transparency`) e flutua logo acima dela, alinhado à direita. Ícone e texto na
 * cor da marca, como os botões de ação dos diálogos.
 */
export function Fab({
  href,
  label,
  icon: Icon,
  className,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "glass-float fixed right-4 bottom-[calc(var(--nav-bottom)+var(--nav-height)+0.75rem)] z-30 inline-flex h-14 items-center gap-2 rounded-full px-5 font-semibold text-brand transition-[transform,background-color] duration-200 hover:bg-glass active:scale-95 md:right-8 lg:hidden",
        className,
      )}
    >
      <Icon aria-hidden className="size-5" strokeWidth={2.4} />
      {label}
    </Link>
  );
}
