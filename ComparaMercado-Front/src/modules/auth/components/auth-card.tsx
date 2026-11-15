import type { ReactNode } from "react";
import { Card } from "@/components/ui/primitives";

/** Moldura das telas de acesso: título, texto de apoio, o formulário e um rodapé de navegação. */
export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <Card className="space-y-5 p-6">
        <header className="space-y-1">
          <h1 className="type-title">{title}</h1>
          {description ? <p className="text-muted-foreground">{description}</p> : null}
        </header>
        {children}
      </Card>
      {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}
    </div>
  );
}
