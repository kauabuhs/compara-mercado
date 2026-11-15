import { signInAsAdmin } from "./session";

// Chamadas diretas à API (como o admin) para PREPARAR cenários dos testes: criar um mercado e um
// produto próprios evita mexer nos preços do seed. A verificação continua sendo pela interface.
// Só roda contra o ambiente local (a API do Playwright, porta E2E_API_PORT).
const API_URL = `http://127.0.0.1:${process.env["E2E_API_PORT"] ?? 4100}`;

/** Cidade piloto do seed (habilitada no comparador). */
export const PILOT_CITY_ID = "10000000-0000-4000-8000-000000000001";

export async function adminAccessToken(): Promise<string> {
  const session = (await signInAsAdmin()) as { access_token: string };
  return session.access_token;
}

export async function apiRequest<T>(
  token: string,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
}

export interface Scenario {
  storeId: string;
  storeName: string;
  productId: string;
  productName: string;
}

/** Nome único por execução, no formato dos demais cadastros de QA. */
export function uniqueName(label: string, projectName: string): string {
  return `QA ${label} ${projectName} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

/** Cria (como admin) um mercado ativo na cidade piloto e um produto ativo, só deste teste. */
export async function createScenario(label: string, projectName: string): Promise<Scenario> {
  const token = await adminAccessToken();
  const storeName = uniqueName(`Mercado ${label}`, projectName);
  const productName = uniqueName(`Produto ${label}`, projectName);

  const store = await apiRequest<{ id: string }>(token, "POST", "/v1/admin/stores", {
    name: storeName,
    cityId: PILOT_CITY_ID,
    lat: -29.17,
    lng: -51.18,
    status: "active",
  });
  if (store.status !== 201) throw new Error(`não criou o mercado (${store.status})`);

  const categories = await apiRequest<{ items: Array<{ id: string }> }>(
    token,
    "GET",
    "/v1/admin/categories?pageSize=1",
  );
  const product = await apiRequest<{ id: string }>(token, "POST", "/v1/admin/products", {
    name: productName,
    categoryId: categories.body.items[0]?.id ?? null,
    sizeValue: 1,
    sizeUnit: "kg",
  });
  if (product.status !== 201) throw new Error(`não criou o produto (${product.status})`);

  return { storeId: store.body.id, storeName, productId: product.body.id, productName };
}
