import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDown, type LucideIcon } from "lucide-react";
import type {
  CSSProperties,
  HTMLAttributes,
  InputHTMLAttributes,
  LiHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/** Cartão: superfície clara sobre o fundo da página. Sem borda e sem sombra. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl bg-surface", className)} {...props} />;
}

/** Lista agrupada (estilo iOS): linhas num só cartão, separadas por fios finos. */
export function Group({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      className={cn("divide-y divide-separator overflow-hidden rounded-2xl bg-surface", className)}
      {...props}
    />
  );
}

export function GroupRow({ className, ...props }: LiHTMLAttributes<HTMLLIElement>) {
  return <li className={cn("relative", className)} {...props} />;
}

const tileTones = {
  brand: "bg-brand text-brand-foreground",
  info: "bg-info text-white",
  warning: "bg-warning text-white",
  danger: "bg-danger text-white",
  neutral: "bg-muted-foreground text-surface",
} as const;

/** Ícone em ladrilho colorido, como nos Ajustes do iOS: dá cor e identidade a cada seção. */
export function IconTile({
  icon: Icon,
  tone = "brand",
  className,
}: {
  icon: LucideIcon;
  tone?: keyof typeof tileTones;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
        tileTones[tone],
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}

function hueFromText(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

/** Miniatura do produto: inicial sobre uma cor suave, sempre a mesma para o mesmo nome. */
export function ProductAvatar({ name, className }: { name: string; className?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      style={{ "--hue": hueFromText(name) } as CSSProperties}
      className={cn(
        "tint inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-semibold",
        className,
      )}
    >
      {initial}
    </span>
  );
}

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium leading-none",
  {
    variants: {
      tone: {
        neutral: "bg-fill text-muted-foreground",
        brand: "bg-brand-soft text-brand-soft-foreground",
        success: "bg-success-soft text-success-soft-foreground",
        info: "bg-info-soft text-info-soft-foreground",
        warning: "bg-warning-soft text-warning-soft-foreground",
        danger: "bg-danger-soft text-danger",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Base visual dos campos: preenchimento translúcido, sem borda; no foco vira superfície clara. */
const fieldClass =
  "h-12 w-full rounded-2xl bg-fill px-4 text-base text-foreground transition-[background-color,box-shadow] duration-200 placeholder:text-muted-foreground hover:bg-fill-strong focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 aria-invalid:bg-danger-soft aria-invalid:ring-2 aria-invalid:ring-danger/40 disabled:cursor-not-allowed disabled:opacity-50";

export function Input({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(fieldClass, className)} {...props} />;
}

/** Select nativo (teclado, leitor de tela e seletor do sistema) com lista de vidro onde suportado. */
export function Select({
  className,
  children,
  ref,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn("field-select", fieldClass, "appearance-none pr-11", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

/** Interruptor (estilo iOS) com alvo de 44 px; o rótulo inteiro é clicável. */
export function Switch({
  className,
  children,
  ref,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role"> & {
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center justify-between gap-4 has-disabled:cursor-not-allowed has-disabled:opacity-50",
        className,
      )}
    >
      <span>{children}</span>
      <span className="relative inline-flex h-8 w-[3.25rem] shrink-0">
        {/* biome-ignore lint/a11y/useAriaPropsForRole: checkbox nativo com role=switch já expõe o estado "checked" */}
        <input ref={ref} type="checkbox" role="switch" className="peer sr-only" {...props} />
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-fill-strong transition-colors duration-200 peer-checked:bg-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring"
        />
        <span
          aria-hidden
          className="absolute top-0.5 left-0.5 size-7 rounded-full bg-white shadow-[0_1px_3px_oklch(0_0_0/0.3)] transition-transform duration-200 ease-(--ease-out) peer-checked:translate-x-5"
        />
      </span>
    </label>
  );
}

/** Rótulo + controle + dica/erro, ligados por ids (leitores de tela leem tudo junto). */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  /** O controle (Input/Select) deve usar o mesmo `id`. */
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="type-label block">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-erro`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-dica`} className="type-caption">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Título de página: um h1 por tela, com descrição opcional e ação à direita. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 space-y-1">
        <h1 className="type-title">{title}</h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

/** Esqueleto de carregamento (em vez de spinner). Decorativo: oculto para leitores de tela. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-2xl bg-fill", className)}
      {...props}
    />
  );
}

/** Estado vazio com texto simples e sempre um próximo passo. */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl bg-surface px-6 py-12 text-center">
      {icon ? (
        <div className="flex size-16 items-center justify-center rounded-full bg-fill text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <h2 className="type-heading">{title}</h2>
      {description ? <p className="max-w-sm text-muted-foreground">{description}</p> : null}
      {action}
    </div>
  );
}
