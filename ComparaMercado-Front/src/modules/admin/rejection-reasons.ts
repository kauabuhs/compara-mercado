/**
 * Motivos prontos para rejeitar ou retirar um preço. O texto escolhido é o que a pessoa que enviou
 * lê em "Meus envios" (a API guarda de 3 a 200 caracteres).
 */
export const REJECTION_REASONS = [
  "O preço não confere com a foto",
  "A foto está ilegível ou não mostra a etiqueta",
  "Produto ou mercado informado errado",
  "Preço repetido ou já publicado",
  "Preço fora da realidade",
  "Outro motivo",
] as const;
