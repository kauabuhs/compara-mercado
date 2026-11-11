import { Button } from "@compara/ui";
import { Search } from "lucide-react";

/** O ponto de partida: um campo grande no topo, como ChatGPT/Claude. GET sem JavaScript. */
export function SearchBox({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <search>
      <form action="/busca" className="relative">
        <label htmlFor="q" className="sr-only">
          Buscar produto
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          id="q"
          name="q"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          defaultValue={defaultValue}
          maxLength={80}
          placeholder="Buscar produto (ex.: arroz)"
          className="h-14 w-full rounded-3xl border border-border bg-surface pr-28 pl-13 text-lg shadow-soft placeholder:text-muted-foreground"
        />
        <Button type="submit" size="sm" className="absolute top-1.5 right-1.5 h-11">
          Buscar
        </Button>
      </form>
    </search>
  );
}
