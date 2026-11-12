"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ADMIN_LINKS = [
  { href: "/admin", label: "Resumo" },
  { href: "/admin/precos", label: "Lançar preços" },
  { href: "/admin/revisao", label: "Fila de revisão" },
] as const;

/** Controle segmentado (estilo iOS) do painel interno; rola na horizontal em telas muito estreitas. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Painel interno" className="-mx-1 overflow-x-auto px-1 py-1">
      <ul className="glass flex w-max min-w-full gap-1 rounded-full p-1 sm:min-w-0">
        {ADMIN_LINKS.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium whitespace-nowrap transition-[background-color,color] duration-200",
                  active
                    ? "bg-surface text-foreground"
                    : "text-muted-foreground hover:bg-fill hover:text-foreground",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
