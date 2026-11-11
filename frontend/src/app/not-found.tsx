import { Button, EmptyState } from "@compara/ui";
import Link from "next/link";

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
