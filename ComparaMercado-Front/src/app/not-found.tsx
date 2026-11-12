import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <EmptyState
      title="Página não encontrada"
      description="O endereço pode ter mudado ou o produto saiu do catálogo."
      action={
        <Button asChild>
          <Link href="/busca">Buscar um produto</Link>
        </Button>
      }
    />
  );
}
