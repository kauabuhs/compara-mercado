"use client";

import { ListChecks, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RowContent, rowClass } from "@/components/ui/controls";
import { ConfirmDialog } from "@/components/ui/dialog";
import { GroupRow, IconTile } from "@/components/ui/primitives";
import { listActions, useList } from "@/stores/shopping-list.store";

/** Linhas da conta sobre a lista de compras, que vive só neste aparelho. */
export function SavedListRows() {
  const items = useList();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const count = items.length;
  const countLabel = count === 0 ? "vazia" : `${count} ${count === 1 ? "item" : "itens"}`;

  return (
    <>
      <GroupRow>
        <Link href="/lista" className={rowClass}>
          <RowContent
            icon={<IconTile icon={ListChecks} tone="brand" />}
            title="Minha lista de compras"
            description="Salva neste aparelho, funciona sem internet"
            trailing={countLabel}
            chevron
          />
        </Link>
      </GroupRow>
      {count > 0 ? (
        <GroupRow>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setIsConfirmOpen(true)}
            className={rowClass}
          >
            <RowContent
              icon={<IconTile icon={Trash2} tone="danger" />}
              title="Limpar lista salva"
              tone="danger"
            />
          </button>
        </GroupRow>
      ) : null}
      <ConfirmDialog
        variant="sheet"
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title="Limpar a lista inteira?"
        description={`${count} ${count === 1 ? "item será removido" : "itens serão removidos"} deste aparelho. Isso não pode ser desfeito.`}
        confirmLabel="Limpar lista"
        destructive
        onConfirm={() => listActions.clear()}
      />
    </>
  );
}
