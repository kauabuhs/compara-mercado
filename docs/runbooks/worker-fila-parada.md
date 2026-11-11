# Runbook — fila do worker parada ou lenta

**Sintomas:** arquivos em `sources.status = 'uploaded'`/`'processing'` por muito tempo; preços novos não aparecem; `current_prices` velha.

## Diagnóstico

1. O worker está vivo? `GET /healthz` do container → `{"status":"ok"}`. Logs: procure `falha ao iniciar` ou `erro do pg-boss`.
2. Fila no Postgres (schema `pgboss`):

   ```sql
   select name, state, count(*) from pgboss.job
   where created_on > now() - interval '1 day' group by 1, 2 order by 1, 2;
   ```

   Muitos `failed`/`retry` → veja `output` do job. `created` acumulando → worker parado.
3. Gasto de IA: log `gasto de IA acima de 80% do teto mensal` ou erro `budget_exceeded` → o teto foi atingido (por design). Aumente `AI_MONTHLY_BUDGET_CENTS` conscientemente ou aguarde o mês virar.
4. `sources.error` mostra a causa de falhas definitivas (arquivo inválido, resposta fora do schema).

## Ações

| Causa                               | Ação                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Worker caiu                         | reiniciar o container; ele retoma jobs pendentes (pg-boss é durável)                                      |
| Provedor de IA fora/limitado        | nada: há retentativa com backoff; acompanhe                                                               |
| Resposta fora do schema persistente | pode ser mudança de modelo/prompt: rodar o golden set                                                     |
| `current_prices` velha              | `select public.refresh_current_prices();` como admin, ou reiniciar o worker (agenda a cada 10 min)        |
| Job preso em `active`               | pg-boss expira por `expireInSeconds`; se necessário `update pgboss.job set state='failed' where id = '…'` |

## Depois

Registrar causa e correção no postmortem (blameless). Se foi falta de alerta, abrir tarefa de observabilidade (Fase 4: alerta de fila parada).
