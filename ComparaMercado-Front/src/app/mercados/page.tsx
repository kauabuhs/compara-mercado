import { MapPinned } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { CityPicker } from "@/modules/city/components/city-picker";
import { StoresView } from "@/modules/stores/components/stores-view";
import { getCitySelection } from "@/server/city";
import { listStores } from "@/services/api/endpoints";

export const metadata: Metadata = { title: "Mercados e mapa" };

export default async function StoresPage() {
  await connection();
  const { cities, selected } = await getCitySelection();
  const picker = <CityPicker cities={cities} selected={selected} />;

  // Cidade da biblioteca que ainda não tem mercados: avisa em vez de mostrar um mapa vazio.
  if (selected?.coverage === "coming_soon") {
    return (
      <div className="space-y-6">
        <PageHeader title="Mercados e mapa" action={picker} />
        <EmptyState
          icon={<MapPinned aria-hidden className="size-7" />}
          title={`Ainda não temos mercados em ${selected.name}`}
          description="A sua cidade já está na nossa lista. Assim que o primeiro mercado for cadastrado, os preços e o mapa aparecem aqui."
          action={picker}
        />
      </div>
    );
  }

  // Sem cidade escolhida (e mais de uma disponível) mostramos todos, com o convite para escolher.
  const stores = await listStores(selected ? { cityId: selected.id } : {});
  return (
    <div className="space-y-6">
      <PageHeader
        title="Mercados e mapa"
        description={selected ? `Mercados de ${selected.name}.` : "Escolha a sua cidade."}
        action={picker}
      />
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
