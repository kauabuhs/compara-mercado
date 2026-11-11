# Imagem do worker. Build a partir da RAIZ do monorepo:
#   docker build -f backend/apps/worker/Dockerfile -t compara-worker .
# O código do worker e dos pacotes internos é empacotado em um único main.js (esbuild),
# então a imagem final não precisa de node_modules nem do código-fonte.

FROM node:24.22.1-alpine AS build
WORKDIR /repo
RUN npm install -g pnpm@12.18.0
COPY . .
RUN pnpm install --frozen-lockfile --filter "@compara/worker..." \
 && pnpm --filter @compara/worker build

FROM node:24.22.1-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/backend/apps/worker/dist/main.js ./main.js
# Roda sem privilégios
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "main.js"]
