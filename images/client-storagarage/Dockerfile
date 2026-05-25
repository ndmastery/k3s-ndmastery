# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
ARG PUBLIC_SITE_URL="https://web.storagarage.com"
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL
ARG PUBLIC_STORAGE_URL="https://s3.storagarage.com"
ENV PUBLIC_STORAGE_URL=$PUBLIC_STORAGE_URL
ARG PUBLIC_REGISTRY_URL="https://registry.storagarage.com"
ENV PUBLIC_REGISTRY_URL=$PUBLIC_REGISTRY_URL
ARG PUBLIC_STORE_URL="https://store.storagarage.com"
ENV PUBLIC_STORE_URL=$PUBLIC_STORE_URL
ARG PUBLIC_SSM_URL="https://ssm.storagarage.com"
ENV PUBLIC_SSM_URL=$PUBLIC_SSM_URL
ARG PUBLIC_STORAGARAGE_ORIGINS="https://web.storagarage.com,https://s3.storagarage.com,https://registry.storagarage.com,https://store.storagarage.com,https://ssm.storagarage.com"
ENV PUBLIC_STORAGARAGE_ORIGINS=$PUBLIC_STORAGARAGE_ORIGINS
ARG PUBLIC_SSO_URL="https://sso.ndmastery.com"
ENV PUBLIC_SSO_URL=$PUBLIC_SSO_URL
ARG PUBLIC_SSO_CLIENT_ID="storagarage"
ENV PUBLIC_SSO_CLIENT_ID=$PUBLIC_SSO_CLIENT_ID
ARG STORAGARAGE_BACKEND_WS_URL="ws://server-ndmastery-stable.ndmastery.svc.cluster.local:4000/storagarage"
ENV STORAGARAGE_BACKEND_WS_URL=$STORAGARAGE_BACKEND_WS_URL
ARG SSO_BACKEND_WS_URL="ws://server-ndmastery-stable.ndmastery.svc.cluster.local:4000/sso"
ENV SSO_BACKEND_WS_URL=$SSO_BACKEND_WS_URL
COPY --from=app package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY --from=app . .

COPY images/runtime/qwik-node-server-entry.tsx /app/src/entry.node-server.tsx
RUN mkdir -p /app/adapters/node-server
COPY images/runtime/qwik-node-vite.config.ts /app/adapters/node-server/vite.config.ts
RUN bun run build.client && bun run build.server

FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
LABEL org.opencontainers.image.title="client-storagarage" \
      org.opencontainers.image.vendor="ndmastery" \
      org.opencontainers.image.url="https://web.storagarage.com" \
      org.opencontainers.image.description="Storagarage web, storage, registry, publishing, and secrets frontend"
WORKDIR /app
ENV NODE_ENV=production \
    PROXY_PORT=3102 \
    APP_INTERNAL_PORT=13102 \
    APP_PROBE_PATH=/ \
    APP_SHUTDOWN_GRACE_MS=30000 \
    TMPDIR=/tmp
COPY images/runtime/node-health-proxy.mjs ./runtime/node-health-proxy.mjs
COPY --from=build --chown=nonroot:nonroot /app/build ./build
COPY --from=build --chown=nonroot:nonroot /app/package.json ./package.json
EXPOSE 3102
USER nonroot:nonroot
CMD ["runtime/node-health-proxy.mjs", "build/entry.node-server.js"]
