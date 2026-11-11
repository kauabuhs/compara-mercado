import {
  apiRoutes,
  ManualPriceRequestSchema,
  ReviewObservationRequestSchema,
} from "@compara/contracts";
import { Hono } from "hono";
import { requireAdmin, requireUser } from "../http/auth";
import { type AppEnv, parseJsonBody, parseUuidParam } from "../http/context";
import { errors } from "../http/errors";
import type { Services } from "../services/types";

/** Dados do usuário logado. O front usa para decidir o que mostrar; a autorização real é aqui. */
export function accountRoutes(services: Services) {
  const routes = new Hono<AppEnv>();
  routes.get(apiRoutes.currentUser, requireUser(services.authenticator), (c) =>
    c.json(c.get("user")),
  );
  return routes;
}

/** Administração: exige login e papel `admin`; as operações rodam sob a RLS do próprio usuário. */
export function adminRoutes(services: Services) {
  const routes = new Hono<AppEnv>();
  routes.use("/v1/admin/*", requireUser(services.authenticator), requireAdmin);

  routes.get(apiRoutes.adminOverview, async (c) => {
    return c.json(await services.adminFor(c.get("accessToken")).getOverview());
  });

  routes.get(apiRoutes.adminPriceFormOptions, async (c) => {
    return c.json(await services.adminFor(c.get("accessToken")).getPriceFormOptions());
  });

  routes.get(apiRoutes.adminReviewQueue, async (c) => {
    const observations = await services.adminFor(c.get("accessToken")).getReviewQueue();
    return c.json({ observations });
  });

  routes.post(apiRoutes.adminCreatePrice, async (c) => {
    const request = await parseJsonBody(c, ManualPriceRequestSchema);
    await services.adminFor(c.get("accessToken")).createManualPrice(request, c.get("user").id);
    return c.json({ ok: true }, 201);
  });

  routes.post(apiRoutes.adminReviewObservation(":observationId"), async (c) => {
    const observationId = parseUuidParam(c, "observationId");
    const { decision } = await parseJsonBody(c, ReviewObservationRequestSchema);
    const decided = await services
      .adminFor(c.get("accessToken"))
      .reviewObservation(observationId, decision);
    if (!decided) throw errors.notFound("Observação não encontrada ou já revisada.");
    return c.json({ ok: true });
  });

  return routes;
}
