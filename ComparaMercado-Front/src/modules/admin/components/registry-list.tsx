import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, Input, Select } from "@/components/ui/primitives";
import type { ListParams } from "@/modules/admin/list-params";

/**
 * Busca e filtro de situação de uma listagem do cadastro. É um formulário GET comum: a busca vira
 * parâmetro de URL (compartilhável, funciona sem JavaScript) e a página volta para a primeira.
 */
export function RegistryToolbar({
  params,
  searchLabel,
  activeLabel,
  inactiveLabel,
}: {
  params: ListParams;
  searchLabel: string;
  activeLabel: string;
  inactiveLabel: string;
}) {
  const situationValue =
    params.situation === "active" ? "ativos" : params.situation === "inactive" ? "inativos" : "";
  return (
    <search>
      <form method="get" className="grid gap-3 sm:grid-cols-[1fr_12rem_auto]">
        <Input
          type="search"
          name="q"
          aria-label={searchLabel}
          placeholder={searchLabel}
          defaultValue={params.q}
          maxLength={80}
        />
        <Select name="situacao" aria-label="Situação" defaultValue={situationValue}>
          <option value="">Todos</option>
          <option value="ativos">{activeLabel}</option>
          <option value="inativos">{inactiveLabel}</option>
        </Select>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>
    </search>
  );
}

/** Bloco recolhível para o formulário de cadastro novo (a lista continua em primeiro plano). */
export function NewRecord({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="glass rounded-3xl">
      <summary className="flex min-h-12 cursor-pointer items-center px-5 font-medium">
        {title}
      </summary>
      <div className="max-w-xl px-5 pb-5">{children}</div>
    </details>
  );
}

/**
 * Uma linha da listagem: identificação, selos, ações rápidas (ativar/desativar) e o formulário de
 * edição recolhido logo abaixo.
 */
export function RegistryRow({
  title,
  meta,
  badges,
  actions,
  children,
}: {
  title: string;
  meta?: string | null | undefined;
  badges?: ReactNode;
  actions?: ReactNode;
  /** Formulário de edição. */
  children: ReactNode;
}) {
  return (
    <li>
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="font-medium break-words">{title}</p>
            {meta ? <p className="type-caption break-words">{meta}</p> : null}
            {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
          </div>
          {actions ? <div className="flex gap-2">{actions}</div> : null}
        </div>
        <details>
          <summary className="flex min-h-11 w-fit cursor-pointer items-center text-sm font-medium text-brand">
            Editar
          </summary>
          <div className="max-w-xl pt-3">{children}</div>
        </details>
      </Card>
    </li>
  );
}
