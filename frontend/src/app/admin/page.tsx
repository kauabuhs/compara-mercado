import { Card } from "@compara/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminOverview } from "@/shared/api/endpoints";
import { getAccessToken } from "@/shared/server/session";

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <Card className="p-4">
      <p className="text-3xl font-semibold tabular-nums">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function AdminHome() {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/conta");
  const overview = await getAdminOverview(accessToken);

  const dashboardStats = [
    { label: "Aguardando revisão", value: overview.pendingReviews, href: "/admin/revisao" },
    { label: "Mercados ativos", value: overview.activeStores },
    { label: "Produtos ativos", value: overview.activeProducts },
    { label: "Preços vigentes", value: overview.currentPrices, href: "/admin/precos" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Painel interno</h1>
      <div className="grid grid-cols-2 gap-3">
        {dashboardStats.map((stat) => (
          <Stat key={stat.label} {...stat} />
        ))}
      </div>
    </div>
  );
}
