"use client";

import { Button } from "@compara/ui";
import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { listActions } from "@/features/shopping-list/list-store";

export function AddToListButton({ productId, name }: { productId: string; name: string }) {
  const [added, setAdded] = useState(false);
  return (
    <Button
      variant={added ? "secondary" : "outline"}
      onClick={() => {
        listActions.add({ productId, name });
        setAdded(true);
        setTimeout(() => setAdded(false), 1800);
      }}
      aria-label={`Adicionar ${name} à lista`}
    >
      {added ? <Check aria-hidden className="size-4" /> : <Plus aria-hidden className="size-4" />}
      <span aria-live="polite">{added ? "Adicionado" : "Adicionar à lista"}</span>
    </Button>
  );
}
