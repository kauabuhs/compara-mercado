"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch } from "@/components/ui/primitives";
import { type ActionState, createManualPrice } from "@/modules/admin/actions";

interface Option {
  id: string;
  label: string;
}

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
      <Field id="storeId" label="Mercado">
        <Select id="storeId" name="storeId" required>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="productId" label="Produto">
        <Select id="productId" name="productId" required>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="price" label="Preço da embalagem (R$)" hint="Use só números, ex.: 5,99.">
        <Input
          id="price"
          name="price"
          inputMode="decimal"
          required
          placeholder="5,99"
          pattern="\d{1,6}([.,]\d{1,2})?"
          title="Use só números, com até 2 casas decimais. Exemplo: 5,99"
          aria-describedby="price-dica"
        />
      </Field>
      <Switch name="promo">É oferta (promoção)</Switch>
      <Field id="validTo" label="Válido até (opcional)">
        <Input id="validTo" name="validTo" type="date" />
      </Field>
      <Button type="submit" loading={isSubmitting} className="w-full">
        {isSubmitting ? "Salvando…" : "Salvar e publicar"}
      </Button>
      {state.message ? (
        <p role="status" className={state.ok ? "text-success-soft-foreground" : "text-danger"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
