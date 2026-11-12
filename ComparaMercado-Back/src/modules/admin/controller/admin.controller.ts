import { Hono } from "hono";
import {
  apiRoutes,
  ManualPriceRequestSchema,
  ReviewObservationRequestSchema,
} from "../../../contracts";
import { requireAdmin, requireUser } from "../../../middlewares/auth";
import { type AppEnv, parseJsonBody, parseUuidParam } from "../../../middlewares/context";
import { errors } from "../../../middlewares/errors";
import type { Authenticator } from "../../auth/auth.types";
import type { AdminServiceFactory } from "../admin.types";

export interface AdminRoutesDeps {
  authenticator: Authenticator;
  adminFor: AdminServiceFactory;
}

/** Administração: exige login e papel `admin`; as operações rodam sob a RLS do próprio usuário. */
export function adminRoutes({ authenticator, adminFor }: AdminRoutesDeps) {
  const routes = new Hono<AppEnv>();
  routes.use("/v1/admin/*", requireUser(authenticator), requireAdmin);

  routes.get(apiRoutes.adminOverview, async (c) => {
    return c.json(await adminFor(c.get("accessToken")).getOverview());
  });

  routes.get(apiRoutes.adminPriceFormOptions, async (c) => {
    return c.json(await adminFor(c.get("accessToken")).getPriceFormOptions());
  });

  routes.get(apiRoutes.adminReviewQueue, async (c) => {
    const observations = await adminFor(c.get("accessToken")).getReviewQueue();
    return c.json({ observations });
  });

  routes.post(apiRoutes.adminCreatePrice, async (c) => {
    const request = await parseJsonBody(c, ManualPriceRequestSchema);
    await adminFor(c.get("accessToken")).createManualPrice(request, c.get("user").id);
    return c.json({ ok: true }, 201);
  });

  routes.post(apiRoutes.adminReviewObservation(":observationId"), async (c) => {
    const observationId = parseUuidParam(c, "observationId");
    const { decision } = await parseJsonBody(c, ReviewObservationRequestSchema);
    const decided = await adminFor(c.get("accessToken")).reviewObservation(observationId, decision);
    if (!decided) throw errors.notFound("Observação não encontrada ou já revisada.");
    return c.json({ ok: true });
  });

  return routes;
}
