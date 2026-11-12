"use client";

import { type ReactNode, useState } from "react";
import { RowContent, rowClass } from "@/components/ui/controls";
import { DetailSheet } from "@/components/ui/sheet";

/**
 * Linha de uma lista agrupada que abre um sheet com o texto completo. O resumo da linha fica
 * cortado em uma linha (`truncate`); o que não coube está sempre a um toque, em `children`.
 */
export function InfoRow({
  icon,
  title,
  summary,
  trailing,
  sheetTitle = title,
  children,
}: {
  icon: ReactNode;
  title: string;
  summary?: ReactNode;
  trailing?: ReactNode;
  sheetTitle?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={rowClass}
      >
        <RowContent icon={icon} title={title} description={summary} trailing={trailing} chevron />
      </button>
      <DetailSheet open={open} onOpenChange={setOpen} title={sheetTitle}>
        <div className="space-y-4 leading-relaxed">{children}</div>
      </DetailSheet>
    </li>
  );
}
