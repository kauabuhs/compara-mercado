"use client";

import { cn } from "@compara/ui";
import { Home, ListChecks, MapPin, Tag, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

/** Navegação inferior no celular e lateral no desktop. */
export function Nav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Principal"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/85 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]",
        "md:inset-y-0 md:right-auto md:w-60 md:border-r md:border-t-0 md:pb-0",
      )}
    >
      <div className="mx-auto hidden px-6 pt-8 pb-4 text-lg font-semibold tracking-tight md:block">
        Compara<span className="text-brand">Mercado</span>
      </div>
      <ul className="mx-auto flex max-w-lg justify-around px-2 md:max-w-none md:flex-col md:justify-start md:gap-1 md:px-3">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 text-xs font-medium transition-colors",
                  "md:min-h-11 md:flex-row md:justify-start md:gap-3 md:px-4 md:text-base",
                  active
                    ? "text-brand md:bg-brand-soft md:text-brand-soft-foreground"
                    : "text-muted-foreground hover:text-foreground md:hover:bg-surface-muted",
                )}
              >
                <Icon aria-hidden className="size-6 md:size-5" strokeWidth={active ? 2.4 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
