"use client";

import type { AdminCategory, AdminCity, AdminProduct, AdminStore } from "@contracts";
import {
  type FormEvent,
  type ReactNode,
  startTransition,
  useActionState,
  useEffect,
  useRef,
} from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch } from "@/components/ui/primitives";
import type { ActionState } from "@/modules/admin/actions";
import { saveCategory, saveCity, saveProduct, saveStore } from "@/modules/admin/registry-actions";

type RegistryAction = (prev: ActionState, form: FormData) => Promise<ActionState>;

const IDLE: ActionState = { ok: false, message: "" };

/**
 * Base dos formulários do cadastro: Server Action + mensagem de resultado. Ao criar (sem `id`),
 * limpa os campos depois de salvar; ao editar, mantém o que a pessoa acabou de gravar.
 *
 * O envio é feito em `onSubmit` (e não em `<form action>`) de propósito: o React 19 reseta o
 * formulário ao fim de toda Server Action, até quando ela falha, e a pessoa perderia o que digitou
 * ao errar um dado (ex.: GTIN repetido). Assim os campos só são limpos quando o cadastro dá certo.
 */
function RegistryForm({
  action,
  id,
  submitLabel,
  children,
}: {
  action: RegistryAction;
  id?: string | undefined;
  submitLabel: string;
  children: ReactNode;
}) {
  const [state, submitAction, isSubmitting] = useActionState<ActionState, FormData>(action, IDLE);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && !id) formRef.current?.reset();
  }, [state, id]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => submitAction(data));
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {children}
      <Button type="submit" loading={isSubmitting} className="w-full sm:w-auto">
        {isSubmitting ? "Salvando…" : submitLabel}
      </Button>
      {state.message ? (
        <p role="status" className={state.ok ? "text-success-soft-foreground" : "text-danger"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** Identificador único por campo: o mesmo formulário aparece em várias linhas da lista. */
function fieldId(name: string, id: string | undefined): string {
  return `${name}-${id ?? "novo"}`;
}

const SIZE_UNITS = [
  ["g", "g (grama)"],
  ["kg", "kg (quilo)"],
  ["ml", "ml (mililitro)"],
  ["l", "l (litro)"],
  ["un", "un (unidade)"],
] as const;

export function CityForm({ city }: { city?: AdminCity }) {
  const id = city?.id;
  return (
    <RegistryForm action={saveCity} id={id} submitLabel={city ? "Salvar alterações" : "Cadastrar"}>
      <Field id={fieldId("name", id)} label="Nome da cidade">
        <Input
          id={fieldId("name", id)}
          name="name"
          required
          minLength={2}
          maxLength={120}
          defaultValue={city?.name ?? ""}
        />
      </Field>
      {city ? (
        <p className="type-caption">
          {city.uf ?? "—"} · IBGE {city.ibgeCode ?? "—"} (não mudam depois de cadastrados)
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="uf-novo" label="UF" hint="Sigla do estado, ex.: RS.">
            <Input id="uf-novo" name="uf" required maxLength={2} pattern="[A-Za-z]{2}" />
          </Field>
          <Field id="ibgeCode-novo" label="Código do IBGE" hint="7 dígitos.">
            <Input
              id="ibgeCode-novo"
              name="ibgeCode"
              required
              inputMode="numeric"
              pattern="\d{7}"
              title="Código do IBGE com 7 dígitos"
            />
          </Field>
        </div>
      )}
      <Switch name="active" defaultChecked={city?.active ?? false}>
        Habilitada no comparador
      </Switch>
    </RegistryForm>
  );
}

export function StoreForm({
  store,
  cities,
}: {
  store?: AdminStore;
  cities: { id: string; name: string }[];
}) {
  const id = store?.id;
  return (
    <RegistryForm
      action={saveStore}
      id={id}
      submitLabel={store ? "Salvar alterações" : "Cadastrar"}
    >
      <Field id={fieldId("name", id)} label="Nome do mercado">
        <Input
          id={fieldId("name", id)}
          name="name"
          required
          minLength={2}
          maxLength={120}
          defaultValue={store?.name ?? ""}
        />
      </Field>
      <Field
        id={fieldId("cityId", id)}
        label="Cidade"
        hint="Só aparecem cidades habilitadas. Habilite a cidade em Cidades antes de cadastrar o primeiro mercado dela."
      >
        <Select
          id={fieldId("cityId", id)}
          name="cityId"
          required
          defaultValue={store?.cityId ?? ""}
        >
          <option value="" disabled>
            Escolha a cidade
          </option>
          {store && !cities.some((city) => city.id === store.cityId) ? (
            <option value={store.cityId}>Cidade atual (fora da lista)</option>
          ) : null}
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={fieldId("neighborhood", id)} label="Bairro (opcional)">
          <Input
            id={fieldId("neighborhood", id)}
            name="neighborhood"
            maxLength={80}
            defaultValue={store?.neighborhood ?? ""}
          />
        </Field>
        <Field id={fieldId("cnpj", id)} label="CNPJ (opcional)" hint="14 dígitos.">
          <Input
            id={fieldId("cnpj", id)}
            name="cnpj"
            inputMode="numeric"
            defaultValue={store?.cnpj ?? ""}
          />
        </Field>
      </div>
      <Field id={fieldId("address", id)} label="Endereço (opcional)">
        <Input
          id={fieldId("address", id)}
          name="address"
          maxLength={200}
          defaultValue={store?.address ?? ""}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={fieldId("lat", id)}
          label="Latitude"
          hint="Ex.: -29,1678 (clique com o botão direito no mapa para copiar)."
        >
          <Input
            id={fieldId("lat", id)}
            name="lat"
            required
            inputMode="decimal"
            defaultValue={store ? String(store.lat) : ""}
          />
        </Field>
        <Field id={fieldId("lng", id)} label="Longitude" hint="Ex.: -51,5167.">
          <Input
            id={fieldId("lng", id)}
            name="lng"
            required
            inputMode="decimal"
            defaultValue={store ? String(store.lng) : ""}
          />
        </Field>
      </div>
      <Field
        id={fieldId("status", id)}
        label="Situação"
        hint="Só mercados ativos aparecem para as pessoas."
      >
        <Select id={fieldId("status", id)} name="status" defaultValue={store?.status ?? "active"}>
          <option value="active">Ativo</option>
          <option value="pending">Pendente (em preparação)</option>
          <option value="inactive">Inativo</option>
        </Select>
      </Field>
    </RegistryForm>
  );
}

export function CategoryForm({
  category,
  categories,
}: {
  category?: AdminCategory;
  categories: { id: string; name: string }[];
}) {
  const id = category?.id;
  return (
    <RegistryForm
      action={saveCategory}
      id={id}
      submitLabel={category ? "Salvar alterações" : "Cadastrar"}
    >
      <Field id={fieldId("name", id)} label="Nome da categoria">
        <Input
          id={fieldId("name", id)}
          name="name"
          required
          minLength={2}
          maxLength={120}
          defaultValue={category?.name ?? ""}
        />
      </Field>
      {category ? (
        <p className="type-caption">Identificador: {category.slug} (não muda depois de criado)</p>
      ) : (
        <Field
          id="slug-novo"
          label="Identificador"
          hint="Minúsculas, números e hífen, ex.: hortifruti. Não muda depois."
        >
          <Input
            id="slug-novo"
            name="slug"
            required
            minLength={2}
            maxLength={60}
            pattern="[a-z0-9\-]+"
            title="Use só letras minúsculas sem acento, números e hífen"
          />
        </Field>
      )}
      <Field id={fieldId("parentId", id)} label="Dentro de (opcional)">
        <Select
          id={fieldId("parentId", id)}
          name="parentId"
          defaultValue={category?.parentId ?? ""}
        >
          <option value="">Nenhuma (categoria principal)</option>
          {category?.parentId && !categories.some((item) => item.id === category.parentId) ? (
            <option value={category.parentId}>Categoria atual (fora da lista)</option>
          ) : null}
          {categories
            .filter((item) => item.id !== id)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </Select>
      </Field>
    </RegistryForm>
  );
}

export function ProductForm({
  product,
  categories,
}: {
  product?: AdminProduct;
  categories: { id: string; name: string }[];
}) {
  const id = product?.id;
  // A lista de categorias traz no máximo 50 itens (limite da API). Se a categoria do produto ficou
  // de fora, ela entra como opção própria: sem isso o campo abriria em "Sem categoria" e salvar
  // apagaria a categoria sem aviso.
  const currentCategoryId = product?.categoryId ?? null;
  const categoryMissing =
    currentCategoryId !== null && !categories.some((category) => category.id === currentCategoryId);
  return (
    <RegistryForm
      action={saveProduct}
      id={id}
      submitLabel={product ? "Salvar alterações" : "Cadastrar"}
    >
      <Field id={fieldId("name", id)} label="Nome do produto" hint="Sem a marca nem o tamanho.">
        <Input
          id={fieldId("name", id)}
          name="name"
          required
          minLength={2}
          maxLength={120}
          defaultValue={product?.name ?? ""}
        />
      </Field>
      {product ? (
        <p className="type-caption">
          Marca: {product.brand ?? "sem marca"} (a marca pertence à família do produto e não é
          editada aqui)
        </p>
      ) : (
        <Field id="brand-novo" label="Marca (opcional)">
          <Input id="brand-novo" name="brand" maxLength={80} />
        </Field>
      )}
      <Field
        id={fieldId("categoryId", id)}
        label="Categoria"
        hint={product ? "Mudar a categoria vale para todas as variantes deste produto." : undefined}
      >
        <Select
          id={fieldId("categoryId", id)}
          name="categoryId"
          defaultValue={product?.categoryId ?? ""}
        >
          <option value="">Sem categoria</option>
          {categoryMissing && currentCategoryId ? (
            <option value={currentCategoryId}>Categoria atual (fora da lista)</option>
          ) : null}
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={fieldId("sizeValue", id)} label="Tamanho da embalagem" hint="Ex.: 5 ou 0,5.">
          <Input
            id={fieldId("sizeValue", id)}
            name="sizeValue"
            required
            inputMode="decimal"
            defaultValue={product ? String(product.sizeValue) : ""}
          />
        </Field>
        <Field id={fieldId("sizeUnit", id)} label="Unidade">
          <Select
            id={fieldId("sizeUnit", id)}
            name="sizeUnit"
            required
            defaultValue={product?.sizeUnit ?? "un"}
          >
            {SIZE_UNITS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        id={fieldId("gtin", id)}
        label="Código de barras (opcional)"
        hint="8, 12, 13 ou 14 dígitos. O dígito verificador é conferido."
      >
        <Input
          id={fieldId("gtin", id)}
          name="gtin"
          inputMode="numeric"
          defaultValue={product?.gtin ?? ""}
        />
      </Field>
    </RegistryForm>
  );
}
