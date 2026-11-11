/** Erro de regra de negócio. Tem código estável para logs e para a interface. */
export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DomainError";
    this.code = code;
  }
}
