import type { Metadata } from "next";
import { connection } from "next/server";
import { StoresView } from "@/features/stores/components/stores-view";
import { listStores } from "@/shared/api/endpoints";

export const metadata: Metadata = { title: "Mercados e mapa" };

export default async function StoresPage() {
  await connection();
  const stores = await listStores();
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Mercados e mapa</h1>
      <StoresView
        stores={stores.map((store) => ({
          id: store.id,
          name: store.name,
          lat: store.lat,
          lng: store.lng,
          neighborhood: store.neighborhood,
          address: store.address,
        }))}
      />
    </div>
  );
}
