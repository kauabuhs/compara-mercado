import type { Metadata } from "next";
import { ListView } from "@/features/shopping-list/components/list-view";

export const metadata: Metadata = { title: "Minha lista" };

export default function ListPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Minha lista de compras</h1>
      <ListView />
    </div>
  );
}
