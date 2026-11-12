import { ChevronRight, Search, X } from "lucide-react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  KeyboardEvent,
  ReactNode,
  Ref,
} from "react";
import { cn } from "@/lib/utils";

/** Filtro em forma de pílula: vidro quando desligado, verde quando ligado. Alvo de 44 px. */
export function Chip({
  selected,
  count,
  className,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "aria-pressed"> & {
  selected: boolean;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap transition-[background-color,color,transform] duration-200 active:scale-[0.97]",
        selected ? "bg-brand text-brand-foreground" : "glass text-foreground hover:bg-glass-strong",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined ? (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
            selected ? "bg-brand-foreground/20" : "bg-fill text-muted-foreground",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

/** Linha horizontal de chips que rola de lado sem mostrar barra (mobile) e quebra no desktop. */
export function ChipRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: agrupamento de filtros em linha rolável; <fieldset> não permite o layout
    <div
      role="group"
      className={cn(
        "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/** Controle segmentado (estilo iOS) para escolher uma entre poucas opções. Setas do teclado trocam. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<SegmentOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + step + options.length) % options.length];
    if (next) onChange(next.value);
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: radiogroup visual customizado; cada opção é um botão com role=radio
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("glass flex gap-1 rounded-full p-1", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: ver acima
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-[background-color,color] duration-200",
              active
                ? "bg-surface text-foreground"
                : "text-muted-foreground hover:bg-fill hover:text-foreground",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Campo de busca de vidro com lupa e botão de limpar. O pai controla o valor. */
export function SearchField({
  label,
  value,
  onValueChange,
  className,
  ref,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref={ref}
        type="search"
        aria-label={label}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        autoComplete="off"
        enterKeyHint="search"
        className="glass h-12 w-full rounded-full pr-12 pl-12 text-base transition-[background-color,box-shadow] duration-200 placeholder:text-muted-foreground hover:bg-glass-strong focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      {value ? (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => onValueChange("")}
          className="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-fill hover:text-foreground"
        >
          <X aria-hidden className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/** Seção de uma lista agrupada: título pequeno acima, nota explicativa abaixo (estilo Ajustes do iOS). */
export function Section({
  title,
  footer,
  className,
  children,
}: {
  title?: string;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      {title ? (
        <h2 className="px-4 text-sm font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </h2>
      ) : null}
      {children}
      {footer ? <p className="type-caption px-4">{footer}</p> : null}
    </section>
  );
}

/** Classe da linha interativa de uma lista agrupada (envolva em Link, button ou a). */
export const rowClass =
  "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted active:bg-fill";

/** Conteúdo padrão de uma linha: ícone, título/descrição e, à direita, texto ou seta. */
export function RowContent({
  icon,
  title,
  description,
  trailing,
  chevron = false,
  tone,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  tone?: "danger";
}) {
  return (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate font-medium", tone === "danger" && "text-danger")}>
          {title}
        </span>
        {description ? <span className="type-caption block truncate">{description}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-sm text-muted-foreground">{trailing}</span> : null}
      {chevron ? (
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      ) : null}
    </>
  );
}
