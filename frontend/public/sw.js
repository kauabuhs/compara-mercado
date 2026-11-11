/* Service worker mínimo e conservador.
 * - Páginas: rede primeiro; se offline, devolve a última cópia visitada (inclui /lista).
 * - Estáticos imutáveis do Next (/_next/static): cache primeiro.
 * - Nunca guarda respostas de API, ações de servidor nem de /admin e /auth (dados sensíveis).
 * Mudou algo aqui? Incremente VERSION para limpar caches antigos. */
const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const STATIC = `static-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => ![PAGES, STATIC].includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

const NEVER_CACHE = [/^\/admin/, /^\/auth/, /^\/conta/, /^\/api/];

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((re) => re.test(url.pathname))) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(
          async () =>
            (await caches.match(req)) ?? (await caches.match("/lista")) ?? Response.error(),
        ),
    );
  }
});
