import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils";

// Cápsulas (raio total) com alvos de toque de pelo menos 44 px (h-11) em todos os tamanhos.
export const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background-color,transform,filter] duration-200 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none",
  {
    variants: {
      variant: {
        // Ação principal: cor sólida da marca (o único elemento "cheio" da tela).
        primary: "bg-brand text-brand-foreground hover:brightness-110 active:brightness-95",
        // Ação secundária: preenchimento translúcido, funciona sobre cartões.
        secondary: "bg-fill text-foreground hover:bg-fill-strong active:bg-fill-strong",
        // Vidro: para botões que ficam sobre o fundo da página ou flutuam.
        outline: "glass text-foreground hover:bg-glass-strong active:bg-glass-strong",
        ghost: "text-foreground hover:bg-fill active:bg-fill-strong",
        danger: "bg-danger text-brand-foreground hover:brightness-110 active:brightness-95",
      },
      size: {
        sm: "h-11 px-4 text-sm",
        md: "h-11 px-5 text-base",
        lg: "h-14 px-7 text-lg",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Mostra um indicador de carregamento e bloqueia novos cliques (sem sair do foco). */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  className,
  variant,
  size,
  asChild,
  loading,
  children,
  ref,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...(loading ? { "aria-busy": true } : {})}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
          {children}
        </>
      )}
    </Comp>
  );
}
