"use client";

import { Home, ListChecks, MapPin, Tag, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Início", icon: Home },
  { href: "/ofertas", label: "Ofertas", icon: Tag },
  { href: "/lista", label: "Lista", icon: ListChecks },
  { href: "/mercados", label: "Mercados", icon: MapPin },
  { href: "/conta", label: "Conta", icon: User },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Navegação principal, um único componente para todos os tamanhos:
 *  - abaixo de 1024 px (celular e tablet): pílula flutuante translúcida, centralizada embaixo;
 *    no celular os itens são ícone sobre rótulo, no tablet ícone ao lado do rótulo;
 *  - a partir de 1024 px: barra lateral fixa (há espaço de sobra e a lista de destinos é curta).
 * As dimensões e a área reservada ao conteúdo vêm dos tokens `--nav-*` (ui/styles.css).
 */
export function Nav() {
  const pathname = usePathname();
  const activeIndex = ITEMS.findIndex(({ href }) => isActive(pathname, href));

  return (
    <nav
      aria-label="Principal"
      className={cn(
        // Pílula (< lg): vidro flutuante em cápsula
        "glass-float fixed inset-x-0 bottom-(--nav-bottom) z-40 mx-auto h-(--nav-height) w-[min(calc(100%-2rem),26rem)] rounded-full md:w-[min(calc(100%-4rem),36rem)]",
        // Painel lateral (lg+): o mesmo vidro, como a sidebar flutuante do iPadOS
        "lg:inset-y-3 lg:right-auto lg:bottom-3 lg:left-3 lg:mx-0 lg:h-auto lg:w-[calc(var(--sidebar-width)-1.5rem)] lg:rounded-3xl",
      )}
    >
      <div className="hidden px-6 pt-7 pb-4 text-lg font-semibold tracking-tight lg:block">
        Compara<span className="text-brand">Mercado</span>
      </div>
      {/* Indicador deslizante do item ativo (só na pílula; os itens têm largura igual). */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 p-1 transition-[transform,opacity] duration-300 ease-(--ease-out) lg:hidden",
          activeIndex < 0 && "opacity-0",
        )}
        style={{
          width: `${100 / ITEMS.length}%`,
          transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`,
        }}
      >
        <span className="block size-full rounded-full bg-brand-soft" />
      </div>
      <ul className="relative flex h-full lg:h-auto lg:flex-col lg:gap-1 lg:px-3">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="relative flex-1 lg:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full min-h-11 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[0.6875rem] font-medium leading-none transition-[color,transform,background-color] duration-150 active:scale-95",
                  "md:flex-row md:gap-2 md:text-sm",
                  "lg:h-11 lg:justify-start lg:gap-3 lg:rounded-2xl lg:px-4 lg:text-base lg:active:scale-100",
                  active
                    ? "text-brand-soft-foreground lg:bg-brand-soft"
                    : "text-muted-foreground hover:text-foreground lg:hover:bg-fill",
                )}
              >
                <Icon
                  aria-hidden
                  className="size-6 shrink-0 md:size-5"
                  strokeWidth={active ? 2.4 : 2}
                />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
