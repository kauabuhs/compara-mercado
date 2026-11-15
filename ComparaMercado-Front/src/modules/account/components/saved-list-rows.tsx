"use client";

import { ListChecks } from "lucide-react";
import Link from "next/link";
import { RowContent, rowClass } from "@/components/ui/controls";
import { GroupRow, IconTile } from "@/components/ui/primitives";
import { useList, useListSyncState } from "@/stores/shopping-list.store";

/** Atalho para a lista de compras, com a contagem de itens e onde ela está guardada. */
export function SavedListRow() {
  const count = useList().length;
  const { signedIn } = useListSyncState();
  // A contagem vai na descrição (não à direita): assim o título nunca é cortado em tela estreita.
  const status = count === 0 ? "Vazia" : `${count} ${count === 1 ? "item" : "itens"}`;
  // Enquanto não sabemos se a sincronização funcionou, não afirmamos onde está a lista.
  const where =
    signedIn === null ? "" : signedIn ? " · salva na sua conta" : " · salva neste aparelho";
  return (
    <GroupRow>
      <Link href="/lista" className={rowClass}>
        <RowContent
          icon={<IconTile icon={ListChecks} tone="brand" />}
          title="Minha lista de compras"
          description={`${status}${where}`}
          chevron
        />
      </Link>
    </GroupRow>
  );
}
