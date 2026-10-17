# Production image: Next.js standalone server plus bundled migrate and seed scripts.
# Built by .github/workflows/deploy.yml and run on the server by deploy/compose.yaml.

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@12.10.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# src/db requires DATABASE_URL at import; the build never connects, so a placeholder is enough
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm build
# One file per script with all dependencies inlined, so the runtime image needs no node_modules for them
RUN pnpm exec esbuild src/db/migrate.ts src/db/seed.ts \
      --bundle --platform=node --format=esm --target=node24 \
      --outdir=scripts --out-extension:.js=.mjs

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts

# Git commit of this build, shown by /health
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
LABEL org.opencontainers.image.revision=$APP_VERSION

USER node
EXPOSE 3000
CMD ["node", "server.js"]
