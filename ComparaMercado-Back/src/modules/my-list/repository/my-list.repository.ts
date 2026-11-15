import { DbError } from "../../../database/errors";
import type { Db } from "../../../database/supabase";
import type { MyListRepository } from "../my-list.types";

function throwIfError(operation: string, error: { message: string; code?: string } | null) {
  if (error) throw new DbError(`${operation}: ${error.message}`, error.code, { cause: error });
}

/**
 * Persistência da lista, sempre com o cliente da própria pessoa: a RLS de `shopping_lists` e
 * `list_items` garante que ela só lê e grava a sua. A troca dos itens é a função
 * `replace_shopping_list` (atômica, e também sujeita à RLS).
 */
export function createMyListRepository(userDb: Db): MyListRepository {
  return {
    async read() {
      const { data, error } = await userDb
        .from("shopping_lists")
        .select("updated_at, list_items(product_id, quantity, position, products(canonical_name))")
        .order("created_at", { ascending: true })
        .order("position", { referencedTable: "list_items", ascending: true })
        .limit(1)
        .maybeSingle();
      throwIfError("myList.read", error);
      if (!data) return { items: [], updatedAt: null };
      return {
        updatedAt: data.updated_at,
        items: data.list_items.flatMap((row) =>
          // produto que a pessoa não pode mais ver (arquivado): fica de fora da lista
          row.products && row.product_id
            ? [
                {
                  productId: row.product_id,
                  quantity: row.quantity,
                  name: row.products.canonical_name,
                },
              ]
            : [],
        ),
      };
    },

    async replace(lines) {
      const { error } = await userDb.rpc("replace_shopping_list", {
        p_items: lines.map((line) => ({ product_id: line.productId, quantity: line.quantity })),
      });
      throwIfError("myList.replace", error);
    },
  };
}
