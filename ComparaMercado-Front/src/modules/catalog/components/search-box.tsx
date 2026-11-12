"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProductAvatar } from "@/components/ui/primitives";
import { formatSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type ProductSuggestion, suggestProductsAction } from "@/modules/catalog/actions";

const DEBOUNCE_MS = 200;
const MIN_TERM_LENGTH = 2;
// Sugestões já buscadas nesta aba (apagar uma letra ou repetir um termo não vai ao servidor).
// As Server Actions rodam uma por vez, então cada ida evitada também destrava as seguintes.
const SUGGESTION_CACHE_MAX_TERMS = 50;

/**
 * O ponto de partida: um campo grande no topo. Sem JavaScript é um formulário GET para /busca.
 * Com JavaScript, sugere produtos enquanto digita (seta + Enter abre direto; Enter sozinho busca).
 */
export function SearchBox({ defaultValue = "" }: { defaultValue?: string }) {
  const router = useRouter();
  const listboxId = useId();
  const [term, setTerm] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLFormElement>(null);
  const latestRequestRef = useRef(0);
  const suggestionCacheRef = useRef(new Map<string, ProductSuggestion[]>());

  // Busca sugestões com pequena espera; respostas antigas (de teclas anteriores) são descartadas.
  useEffect(() => {
    const cleanTerm = term.trim();
    if (cleanTerm.length < MIN_TERM_LENGTH) {
      latestRequestRef.current += 1;
      setSuggestions([]);
      return;
    }
    const requestId = ++latestRequestRef.current;
    const cacheKey = cleanTerm.toLowerCase();
    const remembered = suggestionCacheRef.current.get(cacheKey);
    if (remembered) {
      setSuggestions(remembered);
      setActiveIndex(-1);
      return;
    }
    const timer = setTimeout(async () => {
      const result = await suggestProductsAction(cleanTerm).catch(() => null);
      if (requestId !== latestRequestRef.current) return;
      // A action devolve [] tanto para "sem resultado" quanto para falha da API; lista vazia não
      // é lembrada, para uma instabilidade passageira não "grudar" no termo.
      if (result && result.length > 0) {
        const cache = suggestionCacheRef.current;
        if (cache.size >= SUGGESTION_CACHE_MAX_TERMS) {
          const oldestTerm = cache.keys().next().value;
          if (oldestTerm !== undefined) cache.delete(oldestTerm);
        }
        cache.set(cacheKey, result);
      }
      setSuggestions(result ?? []);
      setActiveIndex(-1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  // Fecha ao clicar fora.
  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  const showList = isOpen && suggestions.length > 0 && term.trim().length >= MIN_TERM_LENGTH;
  const optionId = (index: number) => `${listboxId}-${index}`;

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }
    if (!showList) {
      if (event.key === "ArrowDown" && suggestions.length > 0) setIsOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const chosen = suggestions[activeIndex];
      if (chosen) router.push(`/produto/${chosen.productId}`);
    }
  }

  return (
    <search>
      <form action="/busca" className="relative" ref={containerRef}>
        <label htmlFor="q" className="sr-only">
          Buscar produto
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-5 z-10 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          id="q"
          name="q"
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          enterKeyHint="search"
          autoComplete="off"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
          maxLength={80}
          placeholder="Buscar produto"
          className="glass h-14 w-full rounded-full pr-28 pl-13 text-lg transition-[background-color,box-shadow] duration-200 placeholder:text-muted-foreground hover:bg-glass-strong focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&::-webkit-search-cancel-button]:hidden"
        />
        <Button type="submit" size="sm" className="absolute top-1.5 right-1.5 h-11">
          Buscar
        </Button>

        {showList ? (
          <div className="glass-float absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-3xl p-1.5">
            {/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: padrão WAI-ARIA de combobox com listbox */}
            <ul id={listboxId} role="listbox" aria-label="Sugestões de produtos">
              {suggestions.map((suggestion, index) => (
                // biome-ignore lint/a11y/useKeyWithClickEvents: a navegação por teclado é feita no campo (setas + Enter)
                // biome-ignore lint/a11y/useFocusableInteractive: o foco fica no campo; a opção ativa é indicada por aria-activedescendant
                <li
                  key={suggestion.productId}
                  id={optionId(index)}
                  // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: opção de combobox (WAI-ARIA)
                  role="option"
                  aria-selected={index === activeIndex}
                  // mousedown não tira o foco do campo antes do clique chegar
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => router.push(`/produto/${suggestion.productId}`)}
                  className={cn(
                    "flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 transition-colors",
                    index === activeIndex && "bg-fill-strong",
                  )}
                >
                  <ProductAvatar name={suggestion.name} className="size-10 text-base" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{suggestion.name}</span>
                    <span className="type-caption block truncate">
                      {[suggestion.brand, formatSize(suggestion.sizeValue, suggestion.sizeUnit)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </form>
    </search>
  );
}
