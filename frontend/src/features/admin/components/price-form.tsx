"use client";

import { Button, Input } from "@compara/ui";
import { useActionState } from "react";
import { type ActionState, createManualPrice } from "@/features/admin/actions";

interface Option {
  id: string;
  label: string;
}

const selectClass = "h-11 w-full rounded-2xl border border-border bg-surface px-4 text-base";

export function PriceForm({ stores, products }: { stores: Option[]; products: Option[] }) {
  const [state, submitAction, isSubmitting] = useActionState<ActionState, FormData>(
    createManualPrice,
    {
      ok: false,
      message: "",
    },
  );
  return (
    <form action={submitAction} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="storeId" className="text-sm font-medium">
          Mercado
        </label>
        <select id="storeId" name="storeId" required className={selectClass}>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="productId" className="text-sm font-medium">
          Produto
        </label>
        <select id="productId" name="productId" required className={selectClass}>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="price" className="text-sm font-medium">
          Preço da embalagem (R$)
        </label>
        <Input
          id="price"
          name="price"
          inputMode="decimal"
          required
          placeholder="5,99"
          pattern="\d{1,6}([.,]\d{1,2})?"
          title="Use só números, com até 2 casas decimais. Exemplo: 5,99"
        />
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="promo" className="size-5" /> É oferta (promoção)
      </label>
      <div className="space-y-1">
        <label htmlFor="validTo" className="text-sm font-medium">
          Válido até (opcional)
        </label>
        <Input id="validTo" name="validTo" type="date" />
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Salvando…" : "Salvar e publicar"}
      </Button>
      {state.message ? (
        <p role="status" className={state.ok ? "text-brand-soft-foreground" : "text-danger"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
