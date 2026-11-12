import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { pageRange, pageWindow, totalPages } from "@/lib/pagination";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  /** Listas de servidor: cada página é um link (compartilhável, funciona com o botão voltar). */
  hrefFor?: (page: number) => string;
  /** Listas no navegador (já carregadas): cada página é um botão. */
  onPageChange?: (page: number) => void;
  className?: string;
}

const itemClass =
  "inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-3 text-sm font-medium tabular-nums transition-[background-color,color,transform] duration-200 active:scale-[0.97]";
const idleClass = "glass text-foreground hover:bg-glass-strong";
const currentClass = "bg-brand text-brand-foreground";
const disabledClass = "pointer-events-none text-muted-foreground opacity-50";

const numberFormatter = new Intl.NumberFormat("pt-BR");

/**
 * Paginação numerada: Anterior · 1 … 5 6 7 … 40 · Próxima, mais "Mostrando 21–40 de 1.284".
 * No celular os números dão lugar a "Página 6 de 40" (cabe em 360 px com alvos de 44 px).
 * Some quando há uma página só.
 */
export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
  onPageChange,
  className,
}: PaginationProps) {
  const pages = totalPages(total, pageSize);
  if (pages <= 1) return null;

  const { from, to } = pageRange(page, pageSize, total);
  const hasPrevious = page > 1;
  const hasNext = page < pages;

  function control(target: number, content: ReactNode, options: { label: string; cls: string }) {
    const { label, cls } = options;
    if (hrefFor) {
      return (
        <Link href={hrefFor(target)} aria-label={label} className={cls}>
          {content}
        </Link>
      );
    }
    return (
      <button
        type="button"
        aria-label={label}
        onClick={() => onPageChange?.(target)}
        className={cls}
      >
        {content}
      </button>
    );
  }

  const previousClass = cn(itemClass, idleClass, !hasPrevious && disabledClass);
  const nextClass = cn(itemClass, idleClass, !hasNext && disabledClass);

  return (
    <nav aria-label="Paginação" className={cn("space-y-2", className)}>
      <div className="flex items-center justify-center gap-2">
        {hasPrevious ? (
          control(
            page - 1,
            <>
              <ChevronLeft aria-hidden className="size-4" />
              <span className="hidden sm:inline">Anterior</span>
            </>,
            { label: "Página anterior", cls: previousClass },
          )
        ) : (
          <span aria-hidden className={previousClass}>
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">Anterior</span>
          </span>
        )}

        <p className="px-2 text-sm font-medium tabular-nums sm:hidden">
          Página {page} de {pages}
        </p>

        <ul className="hidden items-center gap-1 sm:flex">
          {pageWindow(page, pages).map((token, index) =>
            token === "ellipsis" ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: reticências não têm identidade; a posição na janela é a chave estável
              <li key={`gap-${index}`} aria-hidden className="px-1 text-muted-foreground">
                …
              </li>
            ) : (
              <li key={token}>
                {token === page ? (
                  <span aria-current="page" className={cn(itemClass, currentClass)}>
                    {token}
                  </span>
                ) : (
                  control(token, token, { label: `Página ${token}`, cls: cn(itemClass, idleClass) })
                )}
              </li>
            ),
          )}
        </ul>

        {hasNext ? (
          control(
            page + 1,
            <>
              <span className="hidden sm:inline">Próxima</span>
              <ChevronRight aria-hidden className="size-4" />
            </>,
            { label: "Próxima página", cls: nextClass },
          )
        ) : (
          <span aria-hidden className={nextClass}>
            <span className="hidden sm:inline">Próxima</span>
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
      <p className="type-caption text-center">
        Mostrando {numberFormatter.format(from)}–{numberFormatter.format(to)} de{" "}
        {numberFormatter.format(total)}
      </p>
    </nav>
  );
}
