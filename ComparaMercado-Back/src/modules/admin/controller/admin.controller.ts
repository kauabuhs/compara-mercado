import { Hono } from "hono";
import {
  apiRoutes,
  ManualPriceRequestSchema,
  ModerationDecisionRequestSchema,
  ModerationQuerySchema,
  ReviewObservationRequestSchema,
  ReviewQueueQuerySchema,
} from "../../../contracts";
import { requireAdmin, requireUser } from "../../../middlewares/auth";
import {
  type AppEnv,
  parseJsonBody,
  parseQuery,
  parseUuidParam,
} from "../../../middlewares/context";
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
    const query = parseQuery(c, ReviewQueueQuerySchema);
    const { items, total } = await adminFor(c.get("accessToken")).getReviewQueue(query);
    return c.json({ observations: items, total, page: query.page, pageSize: query.pageSize });
  });

  routes.post(apiRoutes.adminCreatePrice, async (c) => {
    const request = await parseJsonBody(c, ManualPriceRequestSchema);
    await adminFor(c.get("accessToken")).createManualPrice(request, c.get("user").id);
    return c.json({ ok: true }, 201);
  });

  routes.get(apiRoutes.adminObservationPhoto(":observationId"), async (c) => {
    const observationId = parseUuidParam(c, "observationId");
    const photo = await adminFor(c.get("accessToken")).getObservationPhoto(observationId);
    if (!photo) throw errors.notFound("Foto não encontrada.");
    // Dado sensível: nunca em cache compartilhado, e o navegador não adivinha o tipo.
    return c.body(photo as Uint8Array<ArrayBuffer>, 200, {
      "content-type": "image/jpeg",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    });
  });

  routes.post(apiRoutes.adminReviewObservation(":observationId"), async (c) => {
    const observationId = parseUuidParam(c, "observationId");
    const { decision, note } = await parseJsonBody(c, ReviewObservationRequestSchema);
    const decided = await adminFor(c.get("accessToken")).reviewObservation(
      observationId,
      decision,
      note,
    );
    if (!decided) throw errors.notFound("Observação não encontrada ou já revisada.");
    return c.json({ ok: true });
  });

  routes.get(apiRoutes.adminModeration, async (c) => {
    const query = parseQuery(c, ModerationQuerySchema);
    const { items, total } = await adminFor(c.get("accessToken")).getModerationQueue(query);
    return c.json({ items, total, page: query.page, pageSize: query.pageSize });
  });

  routes.post(apiRoutes.adminModerationTask(":taskId"), async (c) => {
    const taskId = parseUuidParam(c, "taskId");
    const decision = await parseJsonBody(c, ModerationDecisionRequestSchema);
    const decided = await adminFor(c.get("accessToken")).resolveModerationTask(
      taskId,
      decision,
      c.get("user").id,
    );
    if (!decided) throw errors.notFound("Tarefa não encontrada ou já encerrada.");
    return c.json({ ok: true });
  });

  return routes;
}
