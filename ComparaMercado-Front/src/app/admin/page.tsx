import { ClipboardCheck, type LucideIcon, Package, Store, Tag } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, IconTile, PageHeader } from "@/components/ui/primitives";
import { getAccessToken } from "@/server/session";
import { getAdminOverview } from "@/services/api/endpoints";

function Stat({
  label,
  value,
  href,
  icon,
  tone,
}: {
  label: string;
  value: number;
  href?: string;
  icon: LucideIcon;
  tone: "brand" | "info" | "warning" | "danger";
}) {
  const body = (
    <Card
      className={`flex h-full flex-col gap-3 p-4 ${href ? "transition-[background-color,transform] duration-200 hover:bg-surface-muted active:scale-[0.985]" : ""}`}
    >
      <IconTile icon={icon} tone={tone} />
      <div>
        <p className="text-3xl font-semibold tabular-nums">{value}</p>
        <p className="type-caption">{label}</p>
      </div>
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
    {
      label: "Aguardando revisão",
      value: overview.pendingReviews,
      href: "/admin/revisao",
      icon: ClipboardCheck,
      tone: "warning" as const,
    },
    { label: "Mercados ativos", value: overview.activeStores, icon: Store, tone: "info" as const },
    {
      label: "Produtos ativos",
      value: overview.activeProducts,
      icon: Package,
      tone: "brand" as const,
    },
    {
      label: "Preços vigentes",
      value: overview.currentPrices,
      href: "/admin/precos",
      icon: Tag,
      tone: "brand" as const,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Painel interno" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {dashboardStats.map((stat) => (
          <Stat key={stat.label} {...stat} />
        ))}
      </div>
    </div>
  );
}
