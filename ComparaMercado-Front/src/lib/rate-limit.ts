/**
 * Limite de requisições em memória (janela deslizante simples).
 * Limitação conhecida: o estado é por instância. Em serverless com várias instâncias o limite
 * efetivo é maior; o plano de produção move isto para o Postgres/edge (ver ADR de segurança).
 */
export class RateLimiter {
  private readonly hitTimestampsByKey = new Map<string, number[]>();

  constructor(
    private readonly maxHitsPerWindow: number,
    private readonly windowMs: number,
    private readonly maxTrackedKeys = 10_000,
  ) {}

  check(key: string, now = Date.now()): { ok: boolean; retryAfterMs: number } {
    const windowStart = now - this.windowMs;
    const recentHits = (this.hitTimestampsByKey.get(key) ?? []).filter(
      (hitTimestamp) => hitTimestamp > windowStart,
    );
    if (recentHits.length >= this.maxHitsPerWindow) {
      this.hitTimestampsByKey.set(key, recentHits);
      return { ok: false, retryAfterMs: (recentHits[0] ?? now) + this.windowMs - now };
    }
    recentHits.push(now);
    this.hitTimestampsByKey.set(key, recentHits);
    if (this.hitTimestampsByKey.size > this.maxTrackedKeys) this.evictExpiredKeys(windowStart);
    return { ok: true, retryAfterMs: 0 };
  }

  private evictExpiredKeys(windowStart: number): void {
    for (const [key, hitTimestamps] of this.hitTimestampsByKey) {
      if (hitTimestamps.every((hitTimestamp) => hitTimestamp <= windowStart)) {
        this.hitTimestampsByKey.delete(key);
      }
    }
  }
}
