import { Skeleton } from "@/components/ui/primitives";

// Esqueleto em vez de spinner: a tela já "aparece" no formato final.
export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Carregando">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-14" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  );
}
