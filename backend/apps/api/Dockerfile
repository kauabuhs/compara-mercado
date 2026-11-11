# Imagem da API HTTP. Build a partir da RAIZ do monorepo:
#   docker build -f backend/apps/api/Dockerfile -t compara-api .
# O código da API e dos pacotes internos é empacotado em um único main.js (esbuild).
# Variáveis obrigatórias em execução: SUPABASE_URL e SUPABASE_ANON_KEY (a API não usa service_role).

FROM node:24.22.1-alpine AS build
WORKDIR /repo
RUN npm install -g pnpm@12.18.0
COPY . .
RUN pnpm install --frozen-lockfile --filter "@compara/api..." \
 && pnpm --filter @compara/api build

FROM node:24.22.1-alpine AS runtime
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=4000
WORKDIR /app
COPY --from=build /repo/backend/apps/api/dist/main.js ./main.js
# Roda sem privilégios
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:4000/healthz || exit 1
CMD ["node", "main.js"]
