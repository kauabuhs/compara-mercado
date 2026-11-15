import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { ListSyncNote, ListSyncNow } from "@/modules/shopping-list/components/list-sync";
import { ListView } from "@/modules/shopping-list/components/list-view";

export const metadata: Metadata = { title: "Minha lista" };

export default function ListPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Minha lista de compras" />
      <ListSyncNow />
      <ListSyncNote />
      <ListView />
    </div>
  );
}
