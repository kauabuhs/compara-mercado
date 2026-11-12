import type { ApiErrorBody } from "../contracts";

/** Erro esperado da API: vira uma resposta JSON padronizada com status e mensagem seguras. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message } };
  }
}

export const errors = {
  invalidRequest: (message = "Requisição inválida. Confira os dados enviados.") =>
    new ApiError(400, "invalid_request", message),
  unauthenticated: () =>
    new ApiError(401, "unauthenticated", "Faça login para continuar.", {
      "www-authenticate": "Bearer",
    }),
  invalidToken: () =>
    new ApiError(401, "invalid_token", "Sessão inválida ou expirada. Entre novamente.", {
      "www-authenticate": 'Bearer error="invalid_token"',
    }),
  forbidden: () => new ApiError(403, "forbidden", "Acesso restrito a administradores."),
  notFound: (message = "Recurso não encontrado.") => new ApiError(404, "not_found", message),
  rateLimited: (retryAfterSeconds: number) =>
    new ApiError(429, "rate_limited", "Muitas requisições em pouco tempo. Aguarde um minuto.", {
      "retry-after": String(retryAfterSeconds),
    }),
  dataUnavailable: () =>
    new ApiError(
      502,
      "data_unavailable",
      "Não foi possível acessar os dados agora. Tente de novo.",
    ),
};
