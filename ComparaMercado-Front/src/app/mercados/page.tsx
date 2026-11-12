import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/primitives";
import { StoresView } from "@/modules/stores/components/stores-view";
import { listStores } from "@/services/api/endpoints";

export const metadata: Metadata = { title: "Mercados e mapa" };

export default async function StoresPage() {
  await connection();
  const stores = await listStores();
  return (
    <div className="space-y-6">
      <PageHeader title="Mercados e mapa" />
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
