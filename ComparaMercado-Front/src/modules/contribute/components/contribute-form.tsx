"use client";

import { Camera, Check, RefreshCw, Search } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Field, IconTile, Input, Select, Switch } from "@/components/ui/primitives";
import { formatSize } from "@/lib/format";
import { compressPhoto, PhotoError } from "@/lib/photo";
import {
  type ContributeState,
  type ProductOption,
  searchProductOptionsAction,
  submitContributionAction,
} from "@/modules/contribute/actions";

export interface StoreOption {
  id: string;
  name: string;
}

const SEARCH_DEBOUNCE_MS = 250;
const MIN_TERM_LENGTH = 2;

/** Escolha do produto por busca (a lista completa seria enorme): digita, toca no resultado. */
function ProductPicker({
  selected,
  onSelect,
}: {
  selected: ProductOption | null;
  onSelect: (product: ProductOption | null) => void;
}) {
  const [term, setTerm] = useState("");
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [searched, setSearched] = useState(false);
  const latestRequest = useRef(0);

  // Busca com pequena espera; respostas de teclas anteriores são descartadas.
  useEffect(() => {
    const cleanTerm = term.trim();
    latestRequest.current += 1;
    const requestId = latestRequest.current;
    if (cleanTerm.length < MIN_TERM_LENGTH) {
      setOptions([]);
      setSearched(false);
      return;
    }
    const timer = setTimeout(async () => {
      const found = await searchProductOptionsAction(cleanTerm);
      if (requestId !== latestRequest.current) return;
      setOptions(found);
      setSearched(true);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  if (selected) {
    return (
      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{selected.name}</p>
          <p className="type-caption truncate">
            {[selected.brand, formatSize(selected.sizeValue, selected.sizeUnit)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => onSelect(null)}>
          Trocar
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="productSearch"
          type="search"
          autoComplete="off"
          placeholder="Ex.: arroz, leite, café"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          className="pl-11"
          aria-describedby="productSearch-dica"
        />
      </div>
      {options.length > 0 ? (
        <ul className="space-y-1" aria-label="Produtos encontrados">
          {options.map((option) => (
            <li key={option.productId}>
              <button
                type="button"
                onClick={() => onSelect(option)}
                className="flex min-h-12 w-full flex-col items-start justify-center rounded-2xl bg-fill px-4 py-2 text-left transition-colors hover:bg-fill-strong active:bg-fill-strong"
              >
                <span className="font-medium">{option.name}</span>
                <span className="type-caption">
                  {[option.brand, formatSize(option.sizeValue, option.sizeUnit)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : searched ? (
        <p className="type-caption">
          Não achamos esse produto. Tente outro nome. Se ele ainda não está no catálogo, ele chega
          em breve.
        </p>
      ) : null}
    </div>
  );
}

function ContributeFormFields({
  stores,
  onAnother,
}: {
  stores: StoreOption[];
  onAnother: () => void;
}) {
  const [state, submitAction, isSubmitting] = useActionState<ContributeState, FormData>(
    submitContributionAction,
    { ok: false, message: "" },
  );
  // Campos controlados: o React 19 limpa os não controlados depois de cada ação, até quando o envio
  // falha, e o usuário perderia o que digitou.
  const [storeId, setStoreId] = useState("");
  const [price, setPrice] = useState("");
  const [promo, setPromo] = useState(false);
  const [consent, setConsent] = useState(false);
  const [product, setProduct] = useState<ProductOption | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoProblem, setPhotoProblem] = useState("");
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);

  // A pré-visualização é um blob local; libera a memória ao trocar de foto ou sair da tela.
  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function handlePhotoChange(file: File | undefined) {
    if (!file) return;
    setPhotoProblem("");
    setIsPreparingPhoto(true);
    try {
      setPhoto(await compressPhoto(file));
    } catch (error) {
      setPhoto(null);
      setPhotoProblem(
        error instanceof PhotoError ? error.message : "Não foi possível preparar a foto.",
      );
    } finally {
      setIsPreparingPhoto(false);
    }
  }

  if (state.ok) {
    return (
      <Card className="space-y-4 p-6 text-center">
        <IconTile icon={Check} tone="brand" className="mx-auto" />
        <div className="space-y-1">
          <h2 className="type-heading">Obrigado!</h2>
          <p role="status" className="text-muted-foreground">
            {state.message}
          </p>
        </div>
        <Button onClick={onAnother} className="w-full">
          Enviar outro preço
        </Button>
      </Card>
    );
  }

  const canSubmit = Boolean(product && photo) && !isPreparingPhoto;

  return (
    <form
      action={(formData) => {
        // A foto comprimida substitui qualquer arquivo bruto: o original nunca sai do aparelho.
        if (!photo || !product) return;
        formData.set("photo", new File([photo], "etiqueta.jpg", { type: "image/jpeg" }));
        formData.set("productId", product.productId);
        submitAction(formData);
      }}
      className="space-y-5"
    >
      <Field id="storeId" label="Em qual mercado você está?">
        <Select
          id="storeId"
          name="storeId"
          required
          value={storeId}
          onChange={(event) => setStoreId(event.target.value)}
        >
          <option value="" disabled>
            Escolha o mercado
          </option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        id="productSearch"
        label="Qual produto?"
        hint={product ? undefined : "Digite o nome e toque no produto certo."}
      >
        <ProductPicker selected={product} onSelect={setProduct} />
      </Field>

      <Field
        id="price"
        label="Preço da etiqueta (R$)"
        hint="Só números, ex.: 5,99. É o preço da embalagem."
      >
        <Input
          id="price"
          name="price"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          inputMode="decimal"
          required
          placeholder="5,99"
          pattern="\d{1,6}([.,]\d{1,2})?"
          title="Use só números, com até 2 casas decimais. Exemplo: 5,99"
          aria-describedby="price-dica"
        />
      </Field>
      <Switch name="promo" checked={promo} onChange={(event) => setPromo(event.target.checked)}>
        É oferta (promoção)
      </Switch>

      <div className="space-y-2">
        <p className="type-label">Foto da etiqueta</p>
        {photoUrl ? (
          // biome-ignore lint/performance/noImgElement: pré-visualização de um blob local
          <img
            src={photoUrl}
            alt="Foto da etiqueta que será enviada"
            className="max-h-72 w-full rounded-2xl bg-fill object-contain"
          />
        ) : null}
        <label className="inline-flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-fill px-7 text-lg font-medium transition-colors hover:bg-fill-strong active:scale-[0.97] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring">
          {photo ? (
            <RefreshCw aria-hidden className="size-5" />
          ) : (
            <Camera aria-hidden className="size-5" />
          )}
          {isPreparingPhoto ? "Preparando…" : photo ? "Tirar outra foto" : "Tirar foto da etiqueta"}
          {/* Sem `name`: o arquivo bruto não vai no formulário (só a versão comprimida). */}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              void handlePhotoChange(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        <p className="type-caption">Enquadre só a etiqueta, com o preço legível.</p>
        {photoProblem ? (
          <p role="alert" className="text-sm text-danger">
            {photoProblem}
          </p>
        ) : null}
      </div>

      <Switch
        name="consent"
        required
        checked={consent}
        onChange={(event) => setConsent(event.target.checked)}
      >
        A foto mostra só a etiqueta (sem pessoas) e autorizo usá-la para conferir o preço.
      </Switch>

      <Button
        type="submit"
        size="lg"
        loading={isSubmitting}
        disabled={!canSubmit}
        className="w-full"
      >
        {isSubmitting ? "Enviando…" : "Enviar para análise"}
      </Button>
      {!canSubmit && !isSubmitting ? (
        <p className="type-caption text-center">
          {product
            ? "Tire a foto da etiqueta para enviar."
            : "Escolha o produto e tire a foto para enviar."}
        </p>
      ) : null}
      {state.message ? (
        <p role="alert" className="text-danger">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** Reinicia o formulário inteiro (estado e foto) trocando a `key` depois de um envio. */
export function ContributeForm({ stores }: { stores: StoreOption[] }) {
  const [round, setRound] = useState(0);
  return (
    <ContributeFormFields
      key={round}
      stores={stores}
      onAnother={() => setRound((current) => current + 1)}
    />
  );
}
